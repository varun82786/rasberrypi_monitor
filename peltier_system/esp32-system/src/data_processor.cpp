#include "data_processor.h"

RpiMetrics processReceivedData(const String& jsonData) {
    JsonDocument doc;

    RpiMetrics data{};

    // Parse JSON
    DeserializationError error = deserializeJson(doc, jsonData);
    if (error) {
        Serial.println("Failed to parse JSON");
        return data;
    }

    // Extract values from JSON
    data.cpu_usage = doc["cpu_usage"] | 0.0f;
    data.cpu_temperature = doc["cpu_temperature"] | 0.0f;
    data.night_mode = doc["night_mode"] | false;
    data.past_avg_temp = doc["past_avg_temp"] | 0.0f;
    data.lowest_temp = doc["lowest_temp"] | 0.0f;

    return data;
}
