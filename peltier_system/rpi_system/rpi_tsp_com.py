from flask import Flask, request, jsonify
import psutil  # To get system performance stats
import requests
import os
import logging
from apscheduler.schedulers.background import BackgroundScheduler  # For scheduling periodic checks
from dotenv import load_dotenv

load_dotenv()

#user def modules
from operations import *
from ESP32Ops import *

check_interval = int(os.getenv("RPI_CHECK_INTERVAL", "15"))

app = Flask(__name__)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger(__name__)

@app.route('/')
def index():
    return "Hello from Raspberry Pi!"

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"message": "Invalid JSON payload"}), 400

    logger.info("Data received from ESP32: %s", data)
    response = {"message": "Data received successfully!"}
    # implement here to send data from esp32 to things speak
    return jsonify(response)

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        cns_data_to_ESP_TS, 
        'interval', 
        seconds=check_interval,
        coalesce=True,
        max_instances=1,  # Reduce max_instances to 1
        replace_existing=True,  # Add this to replace existing jobs
        misfire_grace_time=10  # Reduce grace time to 10 seconds
    )
    scheduler.start()
    logger.info("Scheduler started with interval=%ss", check_interval)
    

if __name__ == "__main__":
    host = os.getenv("RPI_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("RPI_SERVER_PORT", "5000"))
    logger.info("RPi config: host=%s port=%s interval=%ss esp32=%s", host, port, check_interval, ESP32_IP)

    # Start the scheduler for periodic checks
    start_scheduler()

    # Run the Flask app
    logger.info("Starting RPi server at %s:%s", host, port)
    app.run(host=host, port=port)
