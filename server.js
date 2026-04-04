const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 抓取文章内容
app.post('/api/fetch-article', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '缺少文章链接' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: controller.signal
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `抓取失败，状态码：${response.status}` });
        }

        const html = await response.text();

        // 提取正文文本（简单清洗）
        let text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, '\n')
            .trim();

        // 限制长度，避免超出 AI token 限制
        if (text.length > 8000) {
            text = text.substring(0, 8000) + '\n...(内容已截断)';
        }

        res.json({ content: text, length: text.length });
    } catch (err) {
        if (err.name === 'AbortError') {
            res.status(504).json({ error: '抓取超时，请重试' });
        } else {
            res.status(500).json({ error: '无法抓取该页面：' + err.message });
        }
    } finally {
        clearTimeout(timeout);
    }
});

// AI 分析接口
app.post('/api/chat', async (req, res) => {
    const { provider, apiKey, baseUrl, model, prompt } = req.body;

    if (!apiKey || !baseUrl || !model || !prompt) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
        let response;
        let content;

        if (provider === 'claude') {
            response = await fetch(`${baseUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: prompt }]
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: error.error?.message || '调用 API 失败' });
            }

            const data = await response.json();
            content = data.content[0].text;
        } else {
            response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 4096,
                    temperature: 0.7
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                return res.status(response.status).json({ error: error.error?.message || '调用 API 失败' });
            }

            const data = await response.json();
            content = data.choices[0].message.content;
        }

        res.json({ content });
    } catch (err) {
        if (err.name === 'AbortError') {
            res.status(504).json({ error: '请求超时，请重试' });
        } else {
            res.status(500).json({ error: err.message || '服务器内部错误' });
        }
    } finally {
        clearTimeout(timeout);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器已启动：http://localhost:${PORT}`);
});
