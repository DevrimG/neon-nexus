#!/bin/bash

# Configuration
SWR_DOMAIN="swr.tr-west-1.myhuaweicloud.com"
SWR_ORG="devrim/dify"

# Array of required Dify images (from Helm debug output)
IMAGES=(
    "langgenius/dify-api:3d2aea11a30200d6bf4be3033b6b1ff63bb87ffc"
    "langgenius/dify-web:3d2aea11a30200d6bf4be3033b6b1ff63bb87ffc"
    "bitnami/postgresql:latest"
    "langgenius/redis:6.2.16-debian-12-r3"
    "quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z"
    "quay.io/minio/mc:RELEASE.2024-11-21T17-21-54Z"
    "semitechnologies/weaviate:1.24.8"
    "langgenius/enterprise_gateway:0.14.4"
    "langgenius/dify-plugin-daemon:0.5.0-serverless"
    "downloads.unstructured.io/unstructured-io/unstructured-api:0.0.70"
    "langgenius/dify-sandbox:0.2.12"
    "ubuntu/squid:6.13-25.04_beta"
    "langgenius/enterprise_plugin-crd:0.14.4"
    "langgenius/enterprise_plugin-connector:0.14.4"
    "langgenius/dify-plugin-manager:0.14.4"
    "langgenius/dify-enterprise:0.14.4"
)

# Process each image
for SOURCE_IMAGE in "${IMAGES[@]}"; do
    # Strip registry prefix if present (like quay.io/)
    BASE_IMAGE="${SOURCE_IMAGE##*/}"

    SWR_IMAGE="${SWR_DOMAIN}/${SWR_ORG}/${BASE_IMAGE}"

    echo "----------------------------------------"
    echo "Processing $SOURCE_IMAGE"
    echo "----------------------------------------"

    # Pull the image
    echo "Pulling $SOURCE_IMAGE..."
    docker pull $SOURCE_IMAGE || { echo "Failed to pull $SOURCE_IMAGE"; continue; }

    # Tag it for SWR
    echo "Tagging as $SWR_IMAGE..."
    docker tag $SOURCE_IMAGE $SWR_IMAGE

    # Push to SWR
    echo "Pushing to $SWR_IMAGE..."
    docker push $SWR_IMAGE || { echo "Failed to push $SWR_IMAGE"; continue; }

    echo "Successfully mirrored $SOURCE_IMAGE to $SWR_IMAGE"
done

echo "Mirroring complete."
