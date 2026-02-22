const { getStore } = require('@netlify/blobs');

const store = getStore({
    name: 'lifeuk',
    siteID: '55164303-9af1-4b34-9d32-30729dcf2b63',
    token: '***REDACTED***'
});
const key = 'single-user-progress';

exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'GET') {
            const data = await store.get(key, { type: 'json' });
            if (!data) {
                return {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'No progress saved yet' })
                };
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        }

        if (event.httpMethod === 'PUT') {
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Request body is required' })
                };
            }

            const payload = JSON.parse(event.body);
            payload.updatedAt = payload.updatedAt || new Date().toISOString();
            await store.setJSON(key, payload);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: true, updatedAt: payload.updatedAt })
            };
        }

        if (event.httpMethod === 'DELETE') {
            await store.delete(key);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: true })
            };
        }

        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Method not allowed' })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Server error', error: error.message })
        };
    }
};
