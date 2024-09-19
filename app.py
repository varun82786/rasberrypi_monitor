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


@app.route('/historical_data/<days>')
def historical_data(days):
    # Fetch historical data from ThingSpeak
    response = requests.get(THINGSPEAK_URL, params={'api_key': READ_API_KEY, 'results': 8000})
    data = response.json()
    df = pd.DataFrame(data['feeds'])

    # Convert the timestamp to datetime
    df['created_at'] = pd.to_datetime(df['created_at'])
    # Filter data based on the requested days
    start_date = datetime.now() - timedelta(days=int(days))
    df = df[df['created_at'] >= start_date]

    # Convert to JSON format
    return jsonify(df.to_dict(orient='records'))

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=80, debug=True)
