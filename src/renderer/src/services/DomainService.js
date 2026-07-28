import { apiClient } from '../api/client';
import { globalStore } from '../store/GlobalStore';

export const connectSynergyDomain = async (domain) => {
    let cleanDomain = String(domain || '').trim();
    while (cleanDomain.endsWith('/')) {
        cleanDomain = cleanDomain.slice(0, -1);
    }
    if (!cleanDomain) throw new Error('A domain address is required.');

    apiClient.setBaseUrl(cleanDomain);
    const result = await apiClient.post('/api/web/Login/GetLoginParameters', {
        DomainAddress: cleanDomain,
        Source: 'WebInterface'
    });

    globalStore.set('loginParameters', result);
    globalStore.set('mainUrl', cleanDomain);
    localStorage.setItem('synergy_last_domain', cleanDomain);
    return { domain: cleanDomain, loginParameters: result };
};
