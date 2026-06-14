import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

export async function scrapeGithub(username: string) {
    let httpsAgent;
    const proxyUser = process.env.WEBSHARE_PROXY_USER;
    const proxyPass = process.env.WEBSHARE_PROXY_PASSWORD || process.env["WEBSHARE_PROXY_ PASSWORD"];
    
    if (proxyUser && proxyPass) {
        httpsAgent = new HttpsProxyAgent(`http://${proxyUser}:${proxyPass}@p.webshare.io:80`);
    } else if (process.env.PROXY_URL) {
        httpsAgent = new HttpsProxyAgent(process.env.PROXY_URL);
    }

    try {
        console.log(`Scraping GitHub repositories for ${username}...`);
        const response = await axios.request({
            url: `https://api.github.com/users/${username}/repos`,
            httpsAgent,
            headers: {
                "User-Agent": "GitHub-Aware-Voice-Interviewer-Scraper"
            },
            timeout: 8000
        });
        
        return response.data.map((x: any) => ({
            name: x.name,
            description: x.description || "",
            language: x.language || "",
            stars: x.stargazers_count || 0,
            topics: x.topics || []
        }));
    } catch (err: any) {
        console.warn(`Failed scraping GitHub repos for ${username} with proxy, attempting direct connection:`, err.message);
        
        // Fallback directly
        try {
            const response = await axios.request({
                url: `https://api.github.com/users/${username}/repos`,
                headers: {
                    "User-Agent": "GitHub-Aware-Voice-Interviewer-Scraper"
                },
                timeout: 10000
            });
            
            return response.data.map((x: any) => ({
                name: x.name,
                description: x.description || "",
                language: x.language || "",
                stars: x.stargazers_count || 0,
                topics: x.topics || []
            }));
        } catch (fallbackErr: any) {
            console.error(`GitHub API direct request failed for ${username}:`, fallbackErr.message);
            throw new Error(`Failed to retrieve GitHub repositories for user ${username}: ${fallbackErr.message}`);
        }
    }
}