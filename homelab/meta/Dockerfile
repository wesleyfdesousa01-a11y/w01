FROM python:3.13-slim
WORKDIR /app
COPY meta_publicar.py .
USER 1000:1000
ENV PYTHONUNBUFFERED=1 META_ESTADO=/data/tokens.json
EXPOSE 8787
ENTRYPOINT ["python3", "meta_publicar.py"]
CMD ["servir"]
