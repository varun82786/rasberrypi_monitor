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
    digitalWrite(pin, LOW);
    Relay_State = true;
    Status(); 
}

// Turn relay off
void Relay::off() {
    digitalWrite(pin, HIGH);
    Relay_State = false;
    Status(); 
}

bool Relay::Status() {

    if (Relay_State){
        return true;
    }
    else if (!Relay_State)
    {
        return false;
    }
    Serial.println("contorl reaches to end");
   return 0; 
}