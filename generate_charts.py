import os

services = ["frontend", "backend", "rag-memory", "vision", "audio"]
base_dir = "helm/neon-nexus/charts"

chart_yaml = """apiVersion: v2
name: {svc}
description: A Helm chart for Neon Nexus {svc}
type: application
version: 0.1.0
appVersion: "1.0.0"
"""

values_yaml = """image:
  repository: pontiffscopez/neon-nexus
  tag: "{svc}-latest"
  pullPolicy: Always

service:
  type: ClusterIP
  port: 8000

ingress:
  enabled: false

env: {{}}

annotations: {{}}
"""

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

service_yaml = """apiVersion: v1
kind: Service
metadata:
  name: {{{{ .Release.Name }}}}-{svc}
  labels:
    app: {svc}
  annotations:
    {{{{- toYaml .Values.annotations | nindent 4 }}}}
spec:
  type: {{{{ .Values.service.type }}}}
  ports:
    - port: {{{{ .Values.service.port }}}}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: {svc}
"""

ingress_yaml = """{{{{- if .Values.ingress.enabled -}}}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{{{ .Release.Name }}}}-{svc}
  labels:
    app: {svc}
spec:
  ingressClassName: {{{{ .Values.ingress.className }}}}
  rules:
    {{{{- range .Values.ingress.hosts }}}}
    - host: {{{{ .host | quote }}}}
      http:
        paths:
          {{{{- range .paths }}}}
          - path: {{{{ .path }}}}
            pathType: {{{{ .pathType }}}}
            backend:
              service:
                name: {{{{ $.Release.Name }}}}-{svc}
                port:
                  number: {{{{ $.Values.service.port }}}}
          {{{{- end }}}}
    {{{{- end }}}}
{{{{- end }}}}
"""

for svc in services:
    os.makedirs(f"{base_dir}/{svc}/templates", exist_ok=True)
    with open(f"{base_dir}/{svc}/Chart.yaml", "w") as f:
        f.write(chart_yaml.format(svc=svc))
    with open(f"{base_dir}/{svc}/values.yaml", "w") as f:
        f.write(values_yaml.format(svc=svc))
    with open(f"{base_dir}/{svc}/templates/deployment.yaml", "w") as f:
        f.write(deployment_yaml.format(svc=svc))
    with open(f"{base_dir}/{svc}/templates/service.yaml", "w") as f:
        f.write(service_yaml.format(svc=svc))
    if svc == "frontend":
        with open(f"{base_dir}/{svc}/templates/ingress.yaml", "w") as f:
            f.write(ingress_yaml.format(svc=svc))

print("Charts generated successfully.")
