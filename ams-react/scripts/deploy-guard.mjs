// Build-time guardrails for the deployment targets (local / saas / selfhosted).
//
// Used two ways:
//   - as a Vite plugin (vite.config.js): checks the env before a build and scans
//     the emitted bundle afterwards; any error fails the build.
//   - standalone: `node scripts/deploy-guard.mjs <mode> [distDir]` re-checks the
//     env of <mode> and scans an existing dist/ folder.
//
// Escape hatch for a deliberate production build that talks to localhost (e.g.
// a self-hosted XAMPP box used only on that machine): AMS_ALLOW_LOCALHOST_BUILD=1.
// It is not VITE_-prefixed, so it never reaches the bundle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_URL = /\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b/i;
// In the bundle only a host with a port or path counts: react-router and axios
// embed a bare `http://localhost` as a URL-parsing placeholder.
const BUNDLE_LOCAL_URL = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+|\/[\w.-])/i;
const TARGETS = ['local', 'saas', 'selfhosted'];
// Hostname of the SaaS API. A self-hosted build pointing here would send another
// operator's tenants to the SaaS database.
const SAAS_HOST_HINT = 'railway.app';

const isDevMode = (mode) => mode === 'development';
const allowLocalhost = () => process.env.AMS_ALLOW_LOCALHOST_BUILD === '1';

export function checkEnv(mode, root = ROOT) {
    const env = loadEnv(mode, root, 'VITE_');
    const errors = [];
    const warnings = [];
    const api = env.VITE_API_BASE_URL || '';
    const target = env.VITE_DEPLOYMENT_TARGET || '';

    if (isDevMode(mode)) return { env, errors, warnings };

    if (!api) {
        errors.push(`VITE_API_BASE_URL is not set for mode "${mode}" (expected in .env.${mode} or .env.${mode}.local).`);
    } else if (!/^https?:\/\//i.test(api)) {
        errors.push(`VITE_API_BASE_URL must be an absolute http(s) URL, got "${api}".`);
    } else if (!api.endsWith('/')) {
        warnings.push('VITE_API_BASE_URL should end with a slash.');
    }
    if (!target) {
        warnings.push('VITE_DEPLOYMENT_TARGET is not set; the build is labelled with the mode name.');
    } else if (!TARGETS.includes(target)) {
        errors.push(`VITE_DEPLOYMENT_TARGET must be one of ${TARGETS.join(', ')}, got "${target}".`);
    } else if (target === 'local') {
        errors.push(`Production build (mode "${mode}") is labelled VITE_DEPLOYMENT_TARGET=local — development settings in a production build.`);
    }
    if (target === 'selfhosted' && api.includes(SAAS_HOST_HINT)) {
        errors.push('Self-hosted build points VITE_API_BASE_URL at the SaaS (Railway) API.');
    }
    if (target === 'saas' && api && !api.startsWith('https://')) {
        errors.push('SaaS build must use an https:// API URL.');
    }
    for (const key of ['VITE_API_BASE_URL', 'VITE_ASSET_BASE_URL', 'VITE_PUBLIC_URL']) {
        if (env[key] && LOCAL_URL.test(env[key]) && !allowLocalhost()) {
            errors.push(`${key} points at localhost in a production build (set AMS_ALLOW_LOCALHOST_BUILD=1 if intended).`);
        }
    }
    for (const key of Object.keys(env)) {
        if (/SECRET|PASSWORD|PASS$|PRIVATE|_KEY$/i.test(key) && !/PUBLIC/i.test(key)) {
            errors.push(`${key} looks like a secret — VITE_* variables are published in the bundle.`);
        }
    }
    return { env, errors, warnings };
}

export function scanFiles(files) {
    // files: [{ name, code }]
    if (allowLocalhost()) return [];
    const hits = [];
    for (const { name, code } of files) {
        const match = code.match(BUNDLE_LOCAL_URL);
        if (match) hits.push(`${name}: contains "${match[0]}"`);
    }
    return hits;
}

function report(label, { errors, warnings }) {
    for (const w of warnings) console.warn(`[deploy-guard] warning (${label}): ${w}`);
    if (errors.length) {
        throw new Error(`[deploy-guard] ${label} failed:\n  - ${errors.join('\n  - ')}`);
    }
}

export function deployGuard() {
    let mode = 'development';
    let isBuild = false;
    return {
        name: 'ams-deploy-guard',
        configResolved(config) {
            mode = config.mode;
            isBuild = config.command === 'build';
        },
        buildStart() {
            if (!isBuild) return;
            const result = checkEnv(mode);
            report(`env check for mode "${mode}"`, result);
            console.log(`[deploy-guard] mode=${mode} target=${result.env.VITE_DEPLOYMENT_TARGET || '(unset)'} api=${result.env.VITE_API_BASE_URL || '(dev fallback)'}`);
        },
        generateBundle(_options, bundle) {
            if (!isBuild || isDevMode(mode)) return;
            const files = Object.values(bundle)
                .filter((item) => /\.(js|css|html)$/.test(item.fileName))
                .map((item) => ({ name: item.fileName, code: item.type === 'chunk' ? item.code : String(item.source) }));
            const hits = scanFiles(files);
            report('localhost scan of the bundle', { errors: hits, warnings: [] });
        },
    };
}

// Standalone use.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const mode = process.argv[2] || 'production';
    const distDir = path.resolve(ROOT, process.argv[3] || 'dist');
    try {
        const result = checkEnv(mode);
        report(`env check for mode "${mode}"`, result);
        console.log(`[deploy-guard] env OK: mode=${mode} target=${result.env.VITE_DEPLOYMENT_TARGET || '(unset)'} api=${result.env.VITE_API_BASE_URL || '(dev fallback)'}`);
        if (!isDevMode(mode) && fs.existsSync(distDir)) {
            const files = [];
            const walk = (dir) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) walk(full);
                    else if (/\.(js|css|html)$/.test(entry.name)) {
                        files.push({ name: path.relative(distDir, full), code: fs.readFileSync(full, 'utf8') });
                    }
                }
            };
            walk(distDir);
            report(`localhost scan of ${path.relative(ROOT, distDir)}`, { errors: scanFiles(files), warnings: [] });
            console.log(`[deploy-guard] ${files.length} built files scanned, no localhost URLs.`);
        }
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}
