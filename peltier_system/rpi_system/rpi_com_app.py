from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

ESP32_IP = "http://192.168.31.172"  # Replace with ESP32 IP address

@app.route('/')
def index():
    return "Hello from Raspberry Pi!"

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.json
    print("Data received from ESP32:", data)
    # Respond with a message
    response = {"message": "Data received successfully!"}
    return jsonify(response)

@app.route('/send_data_to_esp32', methods=['POST'])
def send_data_to_esp32():
    try:
        # Example payload data you want to send to ESP32
        payload = {
            "sensor": "Raspberry Pi",
            "temperature": 30.0  # Replace with actual sensor data or any information
        }
        
        # Send the POST request to ESP32
        response = requests.post(f"{ESP32_IP}/data", json=payload)
        
        # Log the response from ESP32
        if response.status_code == 200:
            print("Response from ESP32:", response.json())
            return jsonify({"status": "Data sent to ESP32", "response": response.json()}), 200
        else:
            print("Failed to send data to ESP32.")
            return jsonify({"status": "Failed to send data"}), response.status_code
    except Exception as e:
        print(f"Error sending data to ESP32: {e}")
        return jsonify({"status": "Error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)  # Expose server on all interfaces
