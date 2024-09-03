/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
    "use strict";
    var mqtt = require("mqtt");
    var isUtf8 = require('is-utf8');

    function MQTTInDynamicSubNode(n) {
        RED.nodes.createNode(this, n);
        this.qos = parseInt(n.qos);
        if (isNaN(this.qos) || this.qos < 0 || this.qos > 2) {
            this.qos = 2;
        }
        this.name = n.name;
        this.broker = n.broker;
        this.brokerConn = RED.nodes.getNode(this.broker);
        this.datatype = n.datatype || "utf8";
        this.unsubscribeAfterFirstMsgRecv = n["unsubscribe-after-first-msg-recv"];
        this.debugSubscribe = n["debug-subscribe"];
        this.tls = n.tls || "mqtts";  // Ajout de la propriété TLS ici
        this.subscribed_topics = {};
        var node = this;
        if (this.brokerConn) {
            this.brokerConn.options = this.brokerConn.options || {};
            this.brokerConn.options.protocol = this.tls;
            this.status({
                fill: "red",
                shape: "ring",
                text: "node-red:common.status.disconnected"
            });
            this.on("input", function (msg) {
                var topic = msg.topic;
                // this.payload = msg.payload;
                if (typeof(msg.unsubscribe) !== 'undefined') {
                    // unsubscribe property specified, process
                    var unsubscribe = msg.unsubscribe;
                    if (unsubscribe === true && node.subscribed_topics[topic]) {
                        // unsubscribe single topic
                        if (this.debugSubscribe) {
                            this.warn("msg.unsubscribe = \"" + topic + "\"");
                        }
                        this.brokerConn.unsubscribe(topic, node.id, true);
                        delete node.subscribed_topics[topic]
                        this.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                        return;
                    } else if (unsubscribe === "all") {
                        // unsubscribe all topics
                        if (this.debugSubscribe) {
                            this.warn("msg.unsubscribe = \"all\"");
                        }
                        for (topic in node.subscribed_topics) {
                            this.brokerConn.unsubscribe(topic, node.id, true);
                            delete node.subscribed_topics[topic]
                            this.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                        }
                        return;
                    } else {
                        // topic not subscribed
                        this.error(RED._("mqtt.errors.not-subscribed"));
                    }
                }
                if (topic) {
                    if (!/^(#$|(\+|[^+#]*)(\/(\+|[^+#]*))*(\/(\+|#|[^+#]*))?$)/.test(topic)) {
                        node.warn(RED._("mqtt.errors.invalid-topic"));
                        return;
                    }
                    node.brokerConn.register(this);
                    if (this.debugSubscribe) {
                        this.warn("msg.subscribe = \"" + topic + "\"");
                    }
                    if (! node.subscribed_topics[topic]) {
                        // Register topic and export to node context
                        node.subscribed_topics[topic] = Date.now();
                        this.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                        let options = { qos: this.qos };
                        this.brokerConn.subscribe(topic, options, function (topic, payload, packet) {
                            // Unsubscribe string format "_unsubscribe:<nodeName>"
                            var unsubNode = payload.toString().split(":");
                            unsubNode = unsubNode.length === 2 && unsubNode[0] === "_unsubscribe" ? unsubNode[1] : null;
                            // Check if unsubscribe action is related to this specific node
                            if (unsubNode === node.name) {
                                if (node.subscribed_topics[topic]) {
                                    node.brokerConn.unsubscribe(topic, node.id, true);
                                    delete node.subscribed_topics[topic];
                                    node.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                                    return;
                                } else {
                                    // topic not subscribed
                                    node.error(RED._("mqtt.errors.not-subscribed"));
                                }
                            }
                            // Don't pass unsubscribe msg through nodes
                            if (unsubNode) return;
                            if (node.datatype === "buffer") {
                                // payload = payload;
                            } else if (node.datatype === "base64") {
                                payload = payload.toString('base64');
                            } else if (node.datatype === "utf8") {
                                payload = payload.toString('utf8');
                            } else if (node.datatype === "json") {
                                if (isUtf8(payload)) {
                                    payload = payload.toString();
                                    try {
                                        payload = JSON.parse(payload);
                                    } catch (e) {
                                        node.error(RED._("mqtt.errors.invalid-json-parse"), {
                                            payload: payload,
                                            topic: topic,
                                            qos: packet.qos,
                                            retain: packet.retain
                                        });
                                        return;
                                    }
                                } else {
                                    node.error((RED._("mqtt.errors.invalid-json-string")), {
                                        payload: payload,
                                        topic: topic,
                                        qos: packet.qos,
                                        retain: packet.retain
                                    });
                                    return;
                                }
                            } else {
                                if (isUtf8(payload)) {
                                    payload = payload.toString();
                                }
                            }
                            var msg = {
                                topic: topic,
                                payload: payload,
                                qos: packet.qos,
                                retain: packet.retain,
                            };
                            if ((node.brokerConn.broker === "localhost") || (node.brokerConn.broker === "127.0.0.1")) {
                                msg._topic = topic;
                            }
                            // Unsubscribe if checkbox set
                            if (node.unsubscribeAfterFirstMsgRecv) {
                                node.brokerConn.unsubscribe(topic, node.id, true);
                                delete node.subscribed_topics[topic];
                                node.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                            }

                            node.send(msg);
                        }, this.id);
                        if (this.brokerConn.connected) {
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "node-red:common.status.connected"
                            });
                        }
                    } else {
                        // already subscribed
                        this.error(RED._("mqtt.errors.already-subscribed"));
                    }
                } else {
                    // no topic specified
                    this.error(RED._("mqtt.errors.not-defined"));
                    // node.send(msg);
                }
            });
            this.on('close', function (removed, done) {
                if (node.brokerConn) {
                    //  iterate all subscribed topics and unsubscribe all
                    if (this.debugSubscribe) {
                        this.warn("Unsubscribing on close");
                    }
                    for (var topic in node.subscribed_topics) {
                        this.brokerConn.unsubscribe(topic, node.id, true);
                        delete this.subscribed_topics[topic]
                        this.context().set("subscribed_topics", Object.keys(node.subscribed_topics));
                    }
                    // node.brokerConn.unsubscribe(node.topic, node.id, removed);
                    node.brokerConn.deregister(node, done);
                }
            });
        } else {
            this.error(RED._("mqtt.errors.missing-config"));
        }
    }
    RED.nodes.registerType("mqtt-in-dynamicsub", MQTTInDynamicSubNode);
};
