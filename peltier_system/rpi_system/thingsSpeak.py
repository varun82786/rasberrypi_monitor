import requests

# ThingSpeak API details
WRITE_API_KEY = 'O8W78TIS52FE3FP2'
THINGSPEAK_URL = 'https://api.thingspeak.com/update'



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