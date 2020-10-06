### MQTT input node: mqtt-in-dynamicsub
MQTT node for Node-RED that allows dynamic subscriptions of MQTT topics via messages.
Based on the core Node-RED "mqtt in" node, and uses the core "mqtt-broker" config
node.

Derived originally from [node-red-contrib-digitaloak-mqtt](https://github.com/digitaloak/node-red-contrib-digitaloak-mqtt).

#### Features
- Subscribe to multiple topics dynamically
- Unsubscribe from all subscribed topics
- Unsubscribe a topic automatically after first message is received (for non-wildcard topics)
- Retrieve list of currently subscribed topics from node context
