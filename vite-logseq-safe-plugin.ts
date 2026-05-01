import { mkdir, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { get } from 'node:http'
import type { ConfigEnv, Plugin, ResolvedConfig, ViteDevServer } from 'vite'

const pluginName = 'vite:logseq-safe-dev-plugin'

function getLogseqPluginId(): string {
  try {
    const packageJson = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    const id = JSON.parse(packageJson)?.logseq?.id
    if (typeof id === 'string' && id.length > 0) {
      return id
    }
  } catch {
    // fall through
  }
  return 'logseq-plugin'
}

function requestHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    get(url, { method: 'GET', headers: { accept: 'text/html' } }, (res) => {
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      res.on('error', reject)
    }).on('error', reject)
  })
}

export default function logseqSafeDevPlugin(): Plugin {
  let configEnv: ConfigEnv
  let config: ResolvedConfig
  let server: ViteDevServer | undefined
  const pluginId = getLogseqPluginId()

  return {
    name: pluginName,
    enforce: 'post',

    config(userConfig, resolvedEnv) {
      configEnv = resolvedEnv
      userConfig.base = ''

      if (resolvedEnv.command === 'serve') {
        userConfig.server = {
          ...userConfig.server,
          cors: true,
          host: 'localhost',
          hmr: { host: 'localhost' },
          open: false,
        }
      }

      return userConfig
    },

    configureServer(_server) {
      server = _server
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transform(code, id) {
      if (configEnv.command !== 'serve' || !server) {
        return
      }

      const moduleNode = server.moduleGraph.getModuleById(id)
      const isEntryModule = moduleNode?.importers.size === 0
      const isProjectModule = !id.includes('node_modules') && id.startsWith(process.cwd())
      if (!isEntryModule || !isProjectModule) {
        return
      }

      const injected = `
if (import.meta.hot) {
  import.meta.hot.accept(() => {})
  import.meta.hot.dispose(() => {
    top?.LSPluginCore?.reload?.(${JSON.stringify(pluginId)})
    console.log('✨Plugin ${pluginId} reloaded ✨')
  })

  setTimeout(() => {
    try {
      top?.eval?.(\`
(() => {
  try {
    const page = logseq?.api?.get_current_page?.();
    const name = page?.originalName ?? page?.name;
    if (!name) return;
    logseq?.api?.replace_state?.('home');
    logseq?.api?.replace_state?.('page', { name });
  } catch (err) {
    console.warn('failed to re-render current page', err);
  }
})();\`)
    } catch (err) {
      console.warn('failed to run reload script', err)
    }
  })
}
`

      return {
        code: `${injected}\n${code}`,
        map: null,
      }
    },

    async buildStart() {
      // Dev-only: writes a dist/index.html that points at the dev server via
      // <base href>. Releases must always run `npm run build` first so the
      // production index.html overwrites this one — see .github/workflows/publish.yml.
      if (configEnv.command !== 'serve' || !server?.httpServer) {
        return
      }

      server.httpServer.once('listening', () => {
        const address = server?.httpServer?.address()
        const baseHref = typeof address === 'object' && address
          ? `http://localhost:${address.port}`
          : 'http://localhost:8080'

        requestHtml(baseHref)
          .then(async (html) => {
            const htmlWithBase = html.replace('<head>', `<head><base href="${baseHref}">`)
            await mkdir(config.build.outDir, { recursive: true })
            await writeFile(path.resolve(config.build.outDir, 'index.html'), htmlWithBase, 'utf-8')
            console.info(`${pluginName}: Wrote development index.html`)
          })
          .catch((error) => {
            console.warn(`${pluginName}: Failed to write development index.html`, error)
          })
      })
    },
  }
}
