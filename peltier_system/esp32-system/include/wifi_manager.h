#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>
#include <WebServer.h>

extern WebServer server;

void initWiFi(const char* ssid, const char* password);
void startWebServer();

#endif
