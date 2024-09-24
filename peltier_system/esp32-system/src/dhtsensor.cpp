#include "dhtsensor.h"

DHTSensor::DHTSensor(uint8_t pin, uint8_t type) : dht(pin, type) {}

void DHTSensor::init() {
    dht.begin();
}

float DHTSensor::readTemperature(bool isFahrenheit) {
    return dht.readTemperature(isFahrenheit);
}

float DHTSensor::readHumidity() {
    return dht.readHumidity();
}

float DHTSensor::computeHeatIndex(float temperature, float humidity, bool isFahrenheit) {
    return dht.computeHeatIndex(temperature, humidity, isFahrenheit);
}
