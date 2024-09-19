import requests
import os
import time
import psutil


# ThingSpeak API details
WRITE_API_KEY = 'YOUR_THINGSPEAK_WRITE_API_KEY'
THINGSPEAK_URL = 'https://api.thingspeak.com/update'

# Function to get Raspberry Pi CPU temperature
def get_cpu_temp():
    temp = os.popen("vcgencmd measure_temp").readline()
    return float(temp.replace("temp=", "").replace("'C\n", ""))

# Function to get CPU usage
def get_cpu_usage():
    return psutil.cpu_percent(interval=1)

# Function to get GPU temperature
def get_gpu_temp():
    # Assuming the same as CPU temp (depends on RPi model)
    return get_cpu_temp()

# Function to post data to ThingSpeak
def post_to_thingspeak(cpu_temp, gpu_temp, cpu_usage):
    payload = {
        'api_key': WRITE_API_KEY,
        'field1': cpu_temp,
        'field2': gpu_temp,
        'field3': cpu_usage,
    }
    response = requests.post(THINGSPEAK_URL, params=payload)
    return response.status_code

while True:
    # Gather data
    cpu_temp = get_cpu_temp()
    gpu_temp = get_gpu_temp()
    cpu_usage = get_cpu_usage()

    # Send data to ThingSpeak
    status_code = post_to_thingspeak(cpu_temp, gpu_temp, cpu_usage)
    
    if status_code == 200:
        print("Data uploaded successfully")
    else:
        print("Failed to upload data")

    # Wait for 15 seconds before sending the next data point
    time.sleep(15)
