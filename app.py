from flask import Flask, render_template, jsonify
import requests
import pandas as pd
from datetime import datetime, timedelta

app = Flask(__name__)

# ThingSpeak API details
READ_API_KEY = 'H0USM137GRY8Y3IA'
YOUR_CHANNEL_ID = "2662777"
THINGSPEAK_URL = f'https://api.thingspeak.com/channels/{YOUR_CHANNEL_ID}/feed.json'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/data')
def data():
    # Fetch the latest 15 data points from ThingSpeak
    response = requests.get(THINGSPEAK_URL, params={'api_key': READ_API_KEY, 'results': 15})
    data = response.json()
    return jsonify(data)

@app.route('/graph/<field>')
def graph(field):
    return render_template('graph.html', field=field)

@app.route('/historic_data/<field>/<period>')
def historic_data(field, period):
    # Fetch data based on the selected time range (period)
    results_map = {
        'live': 15,
        '30min': 30,
        '1hr': 60,
        '3hrs': 180,
        '6hrs': 360,
        '12hrs': 720,
        '24hrs': 1440,
        '48hrs': 2880,
        '72hrs': 4320
    }
    results = results_map.get(period, 15)  # Default to 'live' if invalid period

    response = requests.get(THINGSPEAK_URL, params={'api_key': READ_API_KEY, 'results': results})
    data = response.json()
   
    return jsonify(data)



if __name__ == '__main__':
    app.run(host="0.0.0.0", port=6060, debug=True)
