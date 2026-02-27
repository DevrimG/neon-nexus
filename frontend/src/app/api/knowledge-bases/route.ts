import { NextResponse } from 'next/server';

const DIFY_API_URL = process.env.DIFY_API_URL || 'http://dify-api-svc.dify-system.svc.cluster.local:5001/v1';

type DifyDataset = {
    id: string;
    name: string;
    document_count?: number;
    indexing_technique?: string;
};

type DifyDatasetResponse = {
    data?: DifyDataset[];
};

export async function GET(request: Request) {
    // Extract API Key from headers (passed by the frontend UI)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Missing Dify API Key' }, { status: 401 });
    }

    try {
        const res = await fetch(`${DIFY_API_URL}/datasets?page=1&limit=20`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Dify API error: ${res.status} - ${errorText}`);
        }

        const data = (await res.json()) as DifyDatasetResponse;

        // Map Dify's layout to our UI's expectation
        const formattedBases = (data.data ?? []).map((ds) => ({
            name: ds.name,
            id: ds.id,
            vectors_count: ds.document_count ?? 0,
            status: ds.indexing_technique ? "INDEXED" : "PENDING"
        }));

        return NextResponse.json({
            status: 'success',
            knowledge_bases: formattedBases
        });
    } catch (error: unknown) {
        console.error('Error fetching datasets:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
