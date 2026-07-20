FROM python:3.12-alpine
WORKDIR /opt/layertrace
COPY layertrace_agent.py .
ENV PYTHONUNBUFFERED=1 PRINTER_CONNECTOR=bambu_lan
CMD ["python", "layertrace_agent.py"]
