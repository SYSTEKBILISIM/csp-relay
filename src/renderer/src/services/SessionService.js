import { apiClient } from '../api/client'
import { globalStore } from '../store/GlobalStore'

let automaticRenewalCredentials = null
let automaticRenewalPromise = null

const extractToken = result => {
    const resultData = result?.result || result?.Result
    return result?.token || result?.Token || resultData?.token || resultData?.Token || null
}

export const getJwtExpiry = token => {
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
        const payload = JSON.parse(atob(padded))
        return Number.isFinite(payload?.exp) ? payload.exp * 1000 : null
    } catch {
        return null
    }
}

export const renewSynergySession = async ({ username, password, language }, { rememberCredentials = true } = {}) => {
    const encryptedData = globalStore.get('encryptedData')
    const result = await apiClient.post('/api/web/Login/Login', {
        Language: language,
        Username: username,
        Password: password,
        RememberMe: false,
        Captcha: null,
        CaptchaId: null
    }, {
        headers: {
            'bimser-encrypted-data': encryptedData,
            'bimser-language': language
        }
    })

    const isSuccess = result && (result.success || result.Success)
    const token = extractToken(result)
    if (!isSuccess || !token) {
        throw new Error(result?.message || result?.Message || 'The session could not be renewed.')
    }

    globalStore.set('token', token)
    globalStore.set('language', language)
    globalStore.set('session', { username, language })
    if (rememberCredentials) {
        // Kept only in renderer memory for unattended renewal. Never written to
        // GlobalStore, IPC, disk logs, localStorage, or sessionStorage.
        automaticRenewalCredentials = { username, password, language }
    }
    return { result, token }
}

export const renewSynergySessionAutomatically = async ({ staleToken = null } = {}) => {
    if (staleToken && globalStore.get('token') && globalStore.get('token') !== staleToken) {
        return { renewed: false, reusedNewerToken: true, token: globalStore.get('token') }
    }

    if (!automaticRenewalCredentials?.username || !automaticRenewalCredentials?.password) {
        const error = new Error('Credentials for automatic session renewal are not available in memory.')
        error.requiresManualSessionRenewal = true
        throw error
    }

    if (!automaticRenewalPromise) {
        automaticRenewalPromise = renewSynergySession(automaticRenewalCredentials, {
            rememberCredentials: false
        }).then(result => ({
            ...result,
            renewed: true,
            reusedNewerToken: false
        })).finally(() => {
            automaticRenewalPromise = null
        })
    }

    return automaticRenewalPromise
}
