from flask import Flask, request, jsonify
import psutil  # To get system performance stats
import requests
from apscheduler.schedulers.background import BackgroundScheduler  # For scheduling periodic checks

#user def modules
from operations import *

app = Flask(__name__)

ESP32_IP = "http://192.168.31.172:8080"  # Replace with ESP32 IP address

cpu_usage_threshold = 10  # CPU usage threshold to trigger communication
cpu_temp_threshold = 34
check_interval = 5  # Check conditions every 5 seconds

# will implement in seperate file later
def get_cpu_usage():
    return psutil.cpu_percent(interval=1)

def get_cpu_temperature():
    # Example function for CPU temp (implement based on your OS)
    temp = psutil.sensors_temperatures().get('cpu_thermal', [])[0].current
    return temp

def check_and_send_conditions():
    cpu_usage = get_cpu_usage()
    cpu_temp = get_cpu_temperature()
    night_mode = is_night()
    
    print(f"CPU Usage: {cpu_usage}%, CPU Temp: {cpu_temp}°C")

    # If CPU usage or temp exceeds threshold, send data to ESP32
    # Uncomment if you want to add thresholds
    # if cpu_usage > cpu_usage_threshold or cpu_temp > cpu_temp_threshold:
    print("Sending trigger to ESP32...")
    send_data_to_esp32(cpu_usage, cpu_temp, night_mode)

def send_data_to_esp32(cpu_usage, cpu_temp, night_mode):
    try:
        payload = {
            "sensor": "Raspberry Pi",
            "cpu_usage": cpu_usage,
            "cpu_temperature": cpu_temp,
            "night_mode": night_mode
        }
        response = requests.post(f"{ESP32_IP}/data", json=payload)
        if response.status_code == 200:
            print("Response from ESP32:", response.json())
        else:
            print("Failed to send data to ESP32.")
    except Exception as e:
        print(f"Error sending data to ESP32: {e}")

@app.route('/')
def index():
    return "Hello from Raspberry Pi!"

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.json
    print("Data received from ESP32:", data)
    response = {"message": "Data received successfully!"}
    return jsonify(response)

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_and_send_conditions, 'interval', seconds=check_interval)
    scheduler.start()

if __name__ == "__main__":
    # Start the scheduler for periodic checks
    start_scheduler()

    # Run the Flask app
    app.run(host='0.0.0.0', port=5000)
