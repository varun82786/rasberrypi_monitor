#ifndef DHT_SENSOR_H
#define DHT_SENSOR_H

#include <DHT.h>

class DHTSensor {
public:
    DHTSensor(uint8_t pin, uint8_t type);
    void init();
    float readTemperature(bool isFahrenheit = false);
    float readHumidity();
    float computeHeatIndex(float temperature, float humidity, bool isFahrenheit = false);

private:
    DHT dht;
};

#endif
