import requests
import os
import time
import psutil

# ThingSpeak API details
WRITE_API_KEY = 'O8W78TIS52FE3FP2'
THINGSPEAK_URL = 'https://api.thingspeak.com/update'

# Function to get CPU temperature
def get_cpu_temp():
    temp = os.popen("vcgencmd measure_temp").readline()
    return float(temp.replace("temp=", "").replace("'C\n", ""))

# Function to get GPU temperature (usually same as CPU temp on Raspberry Pi)
def get_gpu_temp():
    return get_cpu_temp()

# Function to get CPU usage
def get_cpu_usage():
    return psutil.cpu_percent(interval=1)

# Function to get memory usage
def get_memory_usage():
    return psutil.virtual_memory().used

# Function to get disk usage
def get_disk_usage():
    return psutil.disk_usage('/').free

# Function to get network I/O stats (bytes sent and received)
def get_network_io():
    net_io = psutil.net_io_counters()
    return net_io.bytes_sent, net_io.bytes_recv

# Function to get system uptime (in hours)
def get_system_uptime():
    uptime_seconds = time.time() - psutil.boot_time()
    return uptime_seconds / 3600  # Convert to hours

# Function to post data to ThingSpeak
def post_to_thingspeak(cpu_temp, gpu_temp, cpu_usage, mem_usage, disk_usage, bytes_sent, bytes_recv, uptime):
    payload = {
        'api_key': WRITE_API_KEY,
        'field1': cpu_temp,
        'field2': gpu_temp,
        'field3': cpu_usage,
        'field4': mem_usage,
        'field5': disk_usage,
        'field6': bytes_sent,
        'field7': bytes_recv,
        'field8': uptime
    }
    response = requests.post(THINGSPEAK_URL, params=payload)
    return response.status_code

while True:
    # Gather data
    cpu_temp = get_cpu_temp()
    gpu_temp = get_gpu_temp()
    cpu_usage = get_cpu_usage()
    mem_usage = get_memory_usage()
    disk_usage = get_disk_usage()
    bytes_sent, bytes_recv = get_network_io()
    uptime = get_system_uptime()

    # Send data to ThingSpeak
    status_code = post_to_thingspeak(cpu_temp, gpu_temp, cpu_usage, mem_usage, disk_usage, bytes_sent, bytes_recv, uptime)
    
    if status_code == 200:
        print("Data uploaded successfully")
    else:
        print("Failed to upload data")

    # Wait for 15 seconds before sending the next data point
    time.sleep(30)
