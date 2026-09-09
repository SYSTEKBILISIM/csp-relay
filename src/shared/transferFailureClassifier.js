const CONNECTIVITY_FAILURE_STATUSES = new Set([401, 403, 502, 503, 504])

const stringifyFailure = value => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

const getServerFailureMessage = error => {
    const responseText = stringifyFailure(error?.rawResponse)
    if (!responseText) return null

    if (
        /Execution Timeout Expired/i.test(responseText) ||
        /timeout period elapsed prior to completion of the operation/i.test(responseText) ||
        /Microsoft\.Data\.SqlClient\.SqlException[\s\S]*Error Number:\s*-2/i.test(responseText)
    ) {
        return 'The Synergy server timed out while saving the workflow (database execution timeout). The row remains failed and can be retried after the server/database load is resolved.'
    }

    return null
}

export const getErrorHttpStatus = error => {
    if (Number.isFinite(error?.status)) return error.status
    const match = /\bHTTP\s+(\d{3})\b/i.exec(String(error?.message || ''))
    return match ? Number(match[1]) : null
}

export const isConnectivityFailureStatus = status => CONNECTIVITY_FAILURE_STATUSES.has(status)

export const isExpiredSynergySessionFailure = error => {
    const status = getErrorHttpStatus(error)
    if (status === 401) return true

    const responseText = stringifyFailure(error?.rawResponse)
    if (!responseText) return false

    const isWorkflowSessionParseFailure =
        /WorkflowInstance\.LoadInitialParameters/i.test(responseText) &&
        /Unexpected character encountered while parsing value:\s*</i.test(responseText)

    const isHtmlSessionResponse =
        status === 400 &&
        /(?:<!doctype\s+html|<html|<title[^>]*>)/i.test(responseText) &&
        /(?:login|sign[\s-]?in|oturum|session|unauthori[sz]ed|access denied)/i.test(responseText)

    return isWorkflowSessionParseFailure || isHtmlSessionResponse
}

export const getSessionExpiryMessage = () =>
    'The Synergy session expired. The transfer was paused safely; renew the session and continue with Pending + Failed.'

export const getHttpStatusMessage = status => {
    const statusMessages = {
        401: 'The session is invalid or expired. Sign in again to continue the transfer.',
        403: 'Access to the CSP environment was denied. Check the VPN, environment connection, and session permissions before continuing.',
        404: 'Relay API adresi bulunamadi. Deploy URL ve yayinlanmis Systek_SynergyCSPRelay uygulamasini kontrol edin.',
        502: 'The CSP environment cannot be reached. Check the VPN and environment connection before continuing.',
        503: 'The CSP environment is not responding. Check the VPN and environment connection before continuing.',
        504: 'The CSP environment timed out. Check the VPN and environment connection before continuing.'
    }

    return statusMessages[status] || null
}

export const getNetworkFailureMessage = error => {
    const message = String(error?.message || '')
    if (
        error?.name === 'TypeError' ||
        /failed to fetch|networkerror|load failed|internet disconnected|network request failed/i.test(message)
    ) {
        return 'Could not connect to the CSP environment. Check the VPN and environment connection before continuing.'
    }
    return null
}

export const getTransferFailureMessage = error => {
    if (isExpiredSynergySessionFailure(error)) return getSessionExpiryMessage()
    return getServerFailureMessage(error) ||
        getHttpStatusMessage(getErrorHttpStatus(error)) ||
        getNetworkFailureMessage(error) ||
        error?.message ||
        'Network/Processing Error'
}

export const isConnectivityFailure = error =>
    isExpiredSynergySessionFailure(error) ||
    isConnectivityFailureStatus(getErrorHttpStatus(error)) ||
    Boolean(getNetworkFailureMessage(error))
