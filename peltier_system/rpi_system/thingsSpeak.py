import requests

# ThingSpeak API details
WRITE_API_KEY = 'O8W78TIS52FE3FP2'
THINGSPEAK_URL = 'https://api.thingspeak.com/update'
READ_API_KEY = 'H0USM137GRY8Y3IA'
CHANNEL_ID = '2662777'

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

def get_average_thingspeak(CHANNEL_ID, field_id, READ_API_KEY, results=500):
    url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/fields/{field_id}.json?api_key={READ_API_KEY}&results={results}"
    data = requests.get(url).json()
    values = [float(entry[f'field{field_id}']) for entry in data['feeds'] if entry[f'field{field_id}']]
    return sum(values) / len(values) if values else None

def get_min_thingspeak(CHANNEL_ID, field_id, READ_API_KEY, results=1000):
    url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/fields/{field_id}.json?api_key={READ_API_KEY}&results={results}"
    data = requests.get(url).json()
    values = [float(entry[f'field{field_id}']) for entry in data['feeds'] if entry[f'field{field_id}']]
    return min(values) if values else None