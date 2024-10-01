from flask import Flask, request, jsonify
import psutil  # To get system performance stats
import requests
from apscheduler.schedulers.background import BackgroundScheduler  # For scheduling periodic checks

#user def modules
from operations import *
from ESP32Ops import *

check_interval = 5  # Check conditions every 30 seconds

app = Flask(__name__)

@app.route('/')
def index():
    return "Hello from Raspberry Pi!"

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.json
    print("Data received from ESP32:", data)
    response = {"message": "Data received successfully!"}
    # implement here to send data from esp32 to things speak
    return jsonify(response)

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(cns_data_to_ESP_TS, 'interval', seconds=check_interval)
    scheduler.start()
    

if __name__ == "__main__":
    # Start the scheduler for periodic checks
    start_scheduler()

    # Run the Flask app
    app.run(host='0.0.0.0', port=5000)
