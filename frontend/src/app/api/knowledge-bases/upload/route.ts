import { NextResponse } from 'next/server';

const DIFY_API_URL = process.env.DIFY_API_URL || 'http://dify-api.dify-system.svc.cluster.local:5001/v1';

export async function POST(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Missing Dify API Key' }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const knowledgeName = formData.get('knowledge_name') as string;
        // Dify usually ignores arbitrary chunk size requests from standard endpoints 
        // without advanced workflow building, so we map to basic Dataset Creation API first.

        // 1. Create Empty Dataset First
        const createReq = await fetch(`${DIFY_API_URL}/datasets`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: knowledgeName,
            })
        });

        if (!createReq.ok) {
            const err = await createReq.text();
            throw new Error(`Failed to create dataset: ${err}`);
        }

        const createData = await createReq.json();
        const datasetId = createData.id;

        // 2. Upload Document into Dataset
        const uploadForm = new FormData();
        uploadForm.append('file', file);
        uploadForm.append('data', JSON.stringify({
            indexing_technique: "high_quality",
            process_rule: {
                rules: {},
                mode: "automatic"
            }
        }));

        const uploadReq = await fetch(`${DIFY_API_URL}/datasets/${datasetId}/document/create_by_file`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader, // Let fetch auto-generate the multipart boundary
            },
            body: uploadForm
        });

        if (!uploadReq.ok) {
            const err = await uploadReq.text();
            // Rollback if failure
            await fetch(`${DIFY_API_URL}/datasets/${datasetId}`, { method: 'DELETE', headers: { 'Authorization': authHeader } });
            throw new Error(`Failed to upload document: ${err}`);
        }

        const docData = await uploadReq.json();

        return NextResponse.json({
            status: 'success',
            dataset: datasetId,
            document: docData.document.id
        });

    } catch (error: any) {
        console.error('Error in upload route:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
