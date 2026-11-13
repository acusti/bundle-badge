import minifyWasm from '@oxc-minify/binding-wasm32-wasip1/wasm.wasm';
import { instantiate } from '@oxc-minify/binding-wasm32-wasip1/workerd';
import { gzipSize } from './tar.ts';
import { handleRequest } from './handler.ts';
import { createSource } from './source.ts';
import type { Tools } from './bundle.ts';
import type { Cache } from './size.ts';
import type { SizeResult } from './types.ts';

type Bindings = { SIZES: KVNamespace };

/** Failed lookups are retried after this long; successful ones never expire. */
const FAILURE_TTL_SECONDS = 3600;

const kvCache = (kv: KVNamespace): Cache => ({
    get: (key) => kv.get<SizeResult>(key, 'json'),
    put: (key, result) =>
        kv.put(
            key,
            JSON.stringify(result),
            result.ok ? undefined : { expirationTtl: FAILURE_TTL_SECONDS },
        ),
});

// Instantiating the WebAssembly module costs ~100ms of CPU, so it waits until
// the first cache miss and is then reused by the isolate
type Minifier = Awaited<ReturnType<typeof instantiate>>;
let minifier: Minifier | undefined;
let loading: Promise<Minifier> | undefined;

/** Resolves once the minifier is ready for synchronous use by `tools`. */
const ready = () =>
    (loading ??= instantiate(minifyWasm).then((loaded) => (minifier = loaded)));

const tools: Tools = {
    gzipSize,
    minify(filename, source) {
        if (!minifier) throw new Error('minifier not loaded');
        const { code, errors } = minifier.minifySync(filename, source, {
            compress: { target: 'esnext' },
            mangle: { toplevel: true },
        });
        if (errors.length > 0) throw new Error(errors[0].message);
        return code;
    },
};

const source = createSource(tools);

export default {
    async fetch(request, env, context) {
        return handleRequest(
            request,
            {
                cache: kvCache(env.SIZES),
                source: {
                    measure: async (name, version) => {
                        await ready();
                        return source.measure(name, version);
                    },
                    resolve: (name, spec) => source.resolve(name, spec),
                },
            },
            context,
        );
    },
} satisfies ExportedHandler<Bindings>;
