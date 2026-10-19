// The trimmed vendor build uses native codecs but does not ship zip.js's WASM worker.
// Run the supported decoder in our own module worker instead of requesting missing assets.
export const makeDirectZipLoader = async file => {
    const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
        await import('./vendor/zip.js')
    configure({ useWebWorkers: false })
    const reader = new ZipReader(new BlobReader(file))
    const entries = await reader.getEntries()
    const map = new Map(entries.map(entry => [entry.filename, entry]))
    const load = makeWriter => name => map.has(name)
        ? map.get(name).getData(makeWriter()) : null
    return {
        entries,
        loadText: load(() => new TextWriter()),
        loadBlob: (name, type) => map.has(name)
            ? map.get(name).getData(new BlobWriter(type)) : null,
        getSize: name => map.get(name)?.uncompressedSize ?? 0,
        destroy: () => { void reader.close() },
    }
}

export const makeZipLoader = async file => {
    if (typeof Worker === 'undefined') return makeDirectZipLoader(file)
    let worker
    let stopped = false
    let nextId = 0
    const pending = new Map()
    const stop = error => {
        worker?.terminate()
        worker = null
        for (const { reject } of pending.values()) reject(error)
        pending.clear()
    }
    const request = (type, data = {}) => new Promise((resolve, reject) => {
        const id = ++nextId
        const timeout = setTimeout(() => stop(new Error('Archive worker timed out')), 15000)
        pending.set(id, {
            resolve: result => { clearTimeout(timeout); resolve(result) },
            reject: error => { clearTimeout(timeout); reject(error) },
        })
        try { worker.postMessage({ id, type, ...data }) }
        catch (error) { stop(error) }
    })

    try {
        worker = new Worker(new URL('./zip-worker.js', import.meta.url), { type: 'module' })
        worker.addEventListener('error', () => stop(new Error('Archive worker unavailable')))
        worker.addEventListener('messageerror', () => stop(new Error('Archive worker message failed')))
        worker.addEventListener('message', ({ data: { id, result, error } }) => {
            const task = pending.get(id)
            if (!task) return
            pending.delete(id)
            if (error) task.reject(new Error(error))
            else task.resolve(result)
        })
        const entries = await request('init', { file })
        const map = new Map(entries.map(entry => [entry.filename, entry]))
        let fallback
        const load = (type, name, contentType) => {
            if (!map.has(name)) return null
            if (stopped) return Promise.reject(new Error('Archive closed'))
            return (async () => {
                try {
                    if (!worker) throw new Error('Archive worker unavailable')
                    return await request(type, { name, contentType })
                } catch (error) {
                    if (stopped) throw error
                    stop(error)
                    fallback ??= makeDirectZipLoader(file)
                    const loader = await fallback
                    return type === 'text' ? loader.loadText(name) : loader.loadBlob(name, contentType)
                }
            })()
        }
        return {
            entries,
            loadText: name => load('text', name),
            loadBlob: (name, type) => load('blob', name, type),
            getSize: name => map.get(name)?.uncompressedSize ?? 0,
            destroy: () => {
                stopped = true
                stop(new Error('Archive closed'))
                if (fallback) void fallback.then(loader => loader.destroy())
            },
        }
    } catch (error) {
        stop(error)
        return makeDirectZipLoader(file)
    }
}
