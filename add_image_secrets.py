import os

services = ["frontend", "backend", "rag-memory", "vision", "audio"]
base_dir = "helm/neon-nexus/charts"

values_yaml_append = """
imagePullSecrets:
  - name: dockerhub-secret
"""

for svc in services:
    with open(f"{base_dir}/{svc}/values.yaml", "a") as f:
        f.write(values_yaml_append)

deployment_yaml = """apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{{{ .Release.Name }}}}-{svc}
  labels:
    app: {svc}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {svc}
  template:
    metadata:
      labels:
        app: {svc}
    spec:
      {{{{- if .Values.imagePullSecrets }}}}
      imagePullSecrets:
        {{{{- toYaml .Values.imagePullSecrets | nindent 8 }}}}
      {{{{- end }}}}
      containers:
        - name: {svc}
          image: "{{{{ .Values.image.repository }}}}:{{{{ .Values.image.tag }}}}"
          imagePullPolicy: {{{{ .Values.image.pullPolicy }}}}
          ports:
            - name: http
              containerPort: {{{{ .Values.service.port }}}}
              protocol: TCP
          env:
            {{{{- range $key, $value := .Values.env }}}}
            - name: {{{{ $key }}}}
              value: {{{{ $value | quote }}}}
            {{{{- end }}}}
"""

for svc in services:
    with open(f"{base_dir}/{svc}/templates/deployment.yaml", "w") as f:
        f.write(deployment_yaml.format(svc=svc))

print("Added imagePullSecrets to all deployments.")
