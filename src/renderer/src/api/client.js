import { globalStore } from '../store/GlobalStore';

const getSafeRequestBodyForLog = body => {
    if (!body) return ''

    try {
        const parsed = typeof body === 'string' ? JSON.parse(body) : body
        if (!parsed || typeof parsed !== 'object') return body
        const safeBody = { ...parsed }
        if (Object.prototype.hasOwnProperty.call(safeBody, 'Password')) {
            safeBody.Password = safeBody.Password ? '[REDACTED]' : safeBody.Password
        }
        if (Object.prototype.hasOwnProperty.call(safeBody, 'password')) {
            safeBody.password = safeBody.password ? '[REDACTED]' : safeBody.password
        }
        return safeBody
    } catch {
        return body
    }
}

export class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    setBaseUrl(url) {
        // Remove trailing slash if present
        this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    }

    async request(endpoint, options = {}) {
        if (!this.baseUrl) {
            throw new Error('Base URL is not set. Please select a domain first.');
        }

        const url = `${this.baseUrl}${endpoint}`;

        const defaultHeaders = {
            'Content-Type': 'application/json',
            // Add other default headers if needed
        };

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        };

        console.log(`[API] ${config.method || 'GET'} ${url}`, getSafeRequestBodyForLog(config.body));

        const maxRetries = 3;
        let response = null;

        for (let i = 0; i <= maxRetries; i++) {
            try {
                response = await fetch(url, config);
                if ((response.status === 502 || response.status === 503 || response.status === 504) && i < maxRetries) {
                    console.warn(`[API] ${response.status} Error on ${url}. Retrying ${i + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                    continue;
                }
                break;
            } catch (err) {
                if (i < maxRetries) {
                    console.warn(`[API] Network error on ${url}. Retrying ${i + 1}/${maxRetries}...`, err);
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                    continue;
                }
                throw err;
            }
        }

        try {
            // Capture 'bimser-encrypted-data' header if present
            const encryptedData = response?.headers?.get('bimser-encrypted-data');
            if (encryptedData) {
                console.log('[API] Captured Encrypted Data Header');
                globalStore.set('encryptedData', encryptedData);
            }

            // Handle non-JSON responses or errors gracefully
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = '';

                // 1. Try JSON parsing first
                try {
                    const parsedError = JSON.parse(errorText);
                    if (parsedError.exception && parsedError.exception.Message) {
                        errorMessage = parsedError.exception.Message;
                    } else if (parsedError.message) {
                        errorMessage = parsedError.message;
                    } else if (parsedError.result && parsedError.result.message) {
                        errorMessage = parsedError.result.message;
                    }
                } catch (e) {
                    // Ignore JSON parsing errors
                }

                // 2. Map HTTP statuses if no message found yet
                if (!errorMessage) {
                    const statusMessages = {
                        400: 'Bad request. Please check the submitted information.',
                        401: 'The session is invalid. You may need to sign in again.',
                        403: 'Access denied. You do not have permission to access this page.',
                        404: 'Page not found. Please check the URL.',
                        500: 'Server error. An internal problem occurred.',
                        502: 'The server is not responding. Please try again later.',
                        503: 'The service is currently unavailable. The server may be under maintenance.',
                        504: 'The connection timed out because the server responded too slowly.'
                    };

                    const friendlyStatus = statusMessages[response.status];

                    // 3. Extract meaningful text from HTML if text exists
                    let processedText = errorText || '';
                    if (processedText.includes('<html') || processedText.includes('<HTML')) {
                        const titleMatch = processedText.match(/<title>(.*?)<\/title>/i);
                        processedText = (titleMatch && titleMatch[1]) ? titleMatch[1].trim() : '';
                    }

                    if (friendlyStatus) {
                        errorMessage = friendlyStatus;
                    } else {
                        errorMessage = processedText || `Request failed (Status: ${response.status})`;
                    }
                }

                // specifically handle 511 Network Authentication Required (often used for invalid login in some environments)
                if (response.status === 511) {
                    errorMessage = 'The username or password is incorrect. Please check your credentials.';
                }

                throw new Error(errorMessage);
            }

            // Check content type before parsing json
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('Fetch error details:', error);
            throw error;
        }
    }

    get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { ...options, method: 'GET' });
    }

    post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
}

export const apiClient = new ApiClient();
