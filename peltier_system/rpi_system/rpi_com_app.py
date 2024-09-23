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

@app.route('/command', methods=['GET'])
def send_command():
    command = {"command": "Turn on the LED"}
    return jsonify(command)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)  # Expose server on all interfaces
