import { NextResponse } from 'next/server';

const DIFY_API_URL = process.env.DIFY_API_URL || 'http://dify-api-svc.dify-system.svc.cluster.local:5001/v1';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ name: string }> }
) {
    const resolvedParams = await params;
    const datasetId = resolvedParams.name;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Missing Dify API Key' }, { status: 401 });
    }

    try {
        const res = await fetch(`${DIFY_API_URL}/datasets/${datasetId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader,
            },
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Dify API error: ${res.status} - ${errorText}`);
        }

        return NextResponse.json({ status: 'success' });
    } catch (error: unknown) {
        console.error('Error deleting dataset:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
