#include "Relay.h"
#include <Arduino.h>  // Include necessary for Arduino functions

// Constructor to initialize the relay pin
Relay::Relay(unsigned char relayPin) : pin(relayPin) {}

// Initialize the relay (set pin mode)
void Relay::init() {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);  // Start with relay off
}

// Turn relay on
void Relay::on() {
    digitalWrite(pin, HIGH);
}

// Turn relay off
void Relay::off() {
    digitalWrite(pin, LOW);
}
