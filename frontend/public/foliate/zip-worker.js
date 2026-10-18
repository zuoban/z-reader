import { makeDirectZipLoader } from './zip-loader.js'

let loader
self.addEventListener('message', async ({ data: { id, type, file, name, contentType } }) => {
    try {
        let result
        if (type === 'init') {
            // Older mobile engines may expose streams without supporting ZIP's raw DEFLATE.
            // Probe here so a blocked/unsupported module worker falls back before book parsing.
            new DecompressionStream('deflate-raw')
            loader = await makeDirectZipLoader(file)
            result = loader.entries.map(({ filename, uncompressedSize }) =>
                ({ filename, uncompressedSize }))
        } else if (type === 'text') result = await loader.loadText(name)
        else if (type === 'blob') result = await loader.loadBlob(name, contentType)
        else throw new Error('Unknown archive request')
        self.postMessage({ id, result })
    } catch (error) {
        self.postMessage({ id, error: error.message || 'Archive decoding failed' })
    }
})
