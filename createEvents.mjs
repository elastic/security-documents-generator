import { faker } from '@faker-js/faker';

export default function createEvents(override = {}) {
   return {
    "@timestamp": Date.now(),
    "process": {
      "entity_id": faker.datatype.uuid(),
      "name": faker.datatype.string(),
      "parent": {
        "pid": 1
      },
      "executable": faker.datatype.string(),
      "pid": 25877,
      "hash": {
        "sha1": faker.datatype.string(),
      },
      "args": [
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Versions/A/Support/mdworker_shared",
        "-s",
        "mdworker",
        "-c",
        "MDSImporterWorker",
        "-m",
        "com.apple.mdworker.shared"
      ],
      "working_directory": "/"
    },
    "message": faker.datatype.string(),
    "host": {
        "name": Math.floor(Math.random() * 50000),
        "ip": [
            faker.internet.ip(),
            faker.internet.ip(),
            faker.internet.ip(),
          ],
          "mac": [
            faker.internet.mac(),
            faker.internet.mac(),
            faker.internet.mac(),
          ],
        "os": {
            "type": "macos",
            "platform": "darwin",
            "version": "13.6",
            "family": "darwin",
            "name": "macOS",
            "kernel": "22.6.0",
            "build": "22G120"
          },
    },
    "user": {
        "name": Math.floor(Math.random() * 50000),
    },
    "service": {
      "type": "system"
    },
    "agent": {
      "name": faker.datatype.string(),
      "type": "auditbeat",
      "version": "8.10.2",
      "id": faker.datatype.uuid(),
    },
    "ecs": {
      "version": "8.0.0"
    },
    "event": {
      "kind": "event",
      "category": [
        "process"
      ],
      "type": [
        "start"
      ],
      "action": "process_started",
      "module": "system",
      "dataset": "process"
    },
    ...override
  }
}