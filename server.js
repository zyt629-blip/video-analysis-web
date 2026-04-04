const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/chat', async (req, res) => {
    const { provider, apiKey, baseUrl, model, prompt } = req.body;

    if (!apiKey || !baseUrl || !model || !prompt) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

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
