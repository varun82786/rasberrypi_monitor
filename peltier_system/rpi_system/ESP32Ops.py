import requests

from sysMonitor import *
from ESP32Ops import *
from operations import *
from thingsSpeak import *



ESP32_IP = "http://192.168.31.172:8080"  # Replace with ESP32 IP address

ts_counter = 0; # counter for sending data to things speak

#collect and send data
def cns_data_to_ESP_TS():

    global ts_counter
    ts_counter += 1

    # Gather data
    print(f"Function called {ts_counter} times.")
    cpu_temp = get_cpu_temp()
    gpu_temp = get_gpu_temp()
    cpu_usage = get_cpu_usage()
    mem_usage = get_memory_usage()
    disk_usage = get_disk_usage()
    bytes_sent, bytes_recv = get_network_io()
    uptime = get_system_uptime()
    night_mode = is_night()
    
    print("Sending trigger to ESP32...")
    send_data_to_esp32(cpu_usage, cpu_temp, night_mode)

    if (ts_counter % 6 == 0): #as this function calls at every 5 secs each increment equals to 5sec and sends data for every 30 sec
        # Send data to ThingSpeak
        status_code = post_to_thingspeak(cpu_temp, gpu_temp, cpu_usage, mem_usage, disk_usage, bytes_sent, bytes_recv, uptime)
        
        print("Sending trigger to ThingsSpeak...")
        if status_code == 200:
            print("Data uploaded successfully")
        else:
            print("Failed to upload data")



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