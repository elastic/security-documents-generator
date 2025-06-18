export const GRANTED_RIGHTS_LINUX_SAMPLE_DOCUMENT = (timestamp: string) => {
    return {
        "agent": {
            "id": "f3309354-8f72-4493-98c3-f101c60ef6e1",
            "type": "endpoint",
            "version": "8.17.4"
        },
        "process": {
            "Ext": {
                "ancestry": [
                    "8/gLqFy1Xui/NETn826TSQ",
                    "zGbVMbI5zyIWPzcLy/93zw",
                    "+YzLd8IFhbFU4esh3Vpo5A",
                    "l4K2PdxZfC7oF3oz4fUBRw",
                    "O/QsKeSp8xzN7O+XcYD+rA"
                ]
            },
            "parent": {
                "real_user": {
                    "id": 1030
                },
                "interactive": true,
                "start": timestamp,
                "pid": 1584791,
                "working_directory": "/home/user_working_directory",
                "entity_id": "8/gLqFy1Xui/NETn826TSQ",
                "executable": "/usr/bin/sudo",
                "args": [
                    "sudo",
                    "usermod",
                    "-aG",
                    "test123",
                    "john_smith"
                ],
                "name": "sudo",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "root",
                    "id": 0
                },
                "args_count": 5,
                "user": {
                    "name": "root",
                    "id": 0
                },
                "command_line": "sudo usermod -aG test123 john_smith",
                "group": {
                    "name": "root",
                    "id": 0
                }
            },
            "group_leader": {
                "real_user": {
                    "name": "root",
                    "id": 0
                },
                "interactive": true,
                "start": timestamp,
                "pid": 1584792,
                "working_directory": "/home/user_working_directory",
                "entity_id": "Nkm9JCTawLyFsR3aACBhRA",
                "executable": "/usr/sbin/usermod",
                "args": [
                    "usermod",
                    "-aG",
                    "test123",
                    "john_smith"
                ],
                "name": "usermod",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "root",
                    "id": 0
                },
                "args_count": 4,
                "same_as_process": true,
                "user": {
                    "name": "root",
                    "id": 0
                },
                "group": {
                    "name": "root",
                    "id": 0
                }
            },
            "previous": [
                {
                    "args": [
                        "sudo",
                        "usermod",
                        "-aG",
                        "test123",
                        "john_smith"
                    ],
                    "args_count": 5,
                    "executable": "/usr/bin/sudo"
                }
            ],
            "real_user": {
                "name": "root",
                "id": 0
            },
            "interactive": true,
            "start": timestamp,
            "pid": 1584792,
            "working_directory": "/home/user_working_directory",
            "entity_id": "Nkm9JCTawLyFsR3aACBhRA",
            "executable": "/usr/sbin/usermod",
            "args": [
                "usermod",
                "-aG",
                "test123",
                "john_smith"
            ],
            "session_leader": {
                "real_user": {
                    "id": 1030
                },
                "interactive": true,
                "start": timestamp,
                "pid": 1584791,
                "working_directory": "/home/user_working_directory",
                "entity_id": "8/gLqFy1Xui/NETn826TSQ",
                "executable": "/usr/bin/sudo",
                "args": [
                    "sudo",
                    "usermod",
                    "-aG",
                    "test123",
                    "john_smith"
                ],
                "name": "sudo",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "root",
                    "id": 0
                },
                "args_count": 5,
                "same_as_process": false,
                "user": {
                    "name": "root",
                    "id": 0
                },
                "group": {
                    "name": "root",
                    "id": 0
                }
            },
            "entry_leader": {
                "parent": {
                    "start": timestamp,
                    "pid": 1584710,
                    "entity_id": "l4K2PdxZfC7oF3oz4fUBRw"
                },
                "real_user": {
                    "id": 1030
                },
                "interactive": true,
                "start": timestamp,
                "entry_meta": {
                    "source": {
                        "ip": "35.235.243.210"
                    },
                    "type": "sshd"
                },
                "pid": 1584711,
                "working_directory": "/home/user_working_directory",
                "entity_id": "+YzLd8IFhbFU4esh3Vpo5A",
                "executable": "/bin/bash",
                "args": [
                    "-bash"
                ],
                "name": "bash",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 0
                    }
                },
                "real_group": {
                    "id": 1031
                },
                "args_count": 1,
                "same_as_process": false,
                "user": {
                    "id": 1030
                },
                "group": {
                    "id": 1031
                }
            },
            "name": "usermod",
            "tty": {
                "char_device": {
                    "major": 136,
                    "minor": 1
                }
            },
            "real_group": {
                "name": "root",
                "id": 0
            },
            "args_count": 4,
            "user": {
                "name": "root",
                "id": 0
            },
            "command_line": "usermod -aG test123 john_smith",
            "hash": {
                "sha1": "b9f7c38efebd437006ad7d21de50bd0099592c4a",
                "sha256": "b5e9f510b42451d063b7d03baa9a6abad5a1563b77868ed16968b79435af1d46",
                "md5": "79b65b3c8115734dbb4b45faefd3adad"
            },
            "group": {
                "name": "root",
                "id": 0
            }
        },
        "@timestamp": timestamp,
        "ecs": {
            "version": "8.10.0"
        },
        "data_stream": {
            "namespace": "default",
            "type": "logs",
            "dataset": "endpoint.events.process"
        },
        "elastic": {
            "agent": {
                "id": "f3309354-8f72-4493-98c3-f101c60ef6e1"
            }
        },
        "host": {
            "hostname": "test-ea-april-2025",
            "os": {
                "Ext": {
                    "variant": "Debian"
                },
                "kernel": "6.1.0-31-cloud-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.128-1 (2025-02-07)",
                "name": "Linux",
                "family": "debian",
                "type": "linux",
                "version": "12.10",
                "platform": "debian",
                "full": "Debian 12.10"
            },
            "ip": [
                "127.0.0.1",
                "::1",
                "10.142.0.121",
                "fe80::4001:aff:fe8e:79"
            ],
            "name": "test-ea-april-2025",
            "id": "6e89a2e7e6b24ccb9f7fa5ebdc68ddab",
            "mac": [
                "42-01-0a-8e-00-79"
            ],
            "architecture": "x86_64"
        },
        "event": {
            "agent_id_status": "verified",
            "sequence": 10512801,
            "ingested": timestamp,
            "created": timestamp,
            "kind": "event",
            "module": "endpoint",
            "action": [
                "exec"
            ],
            "id": "NzNEBiqbm2Hs1mAD++++qNqu",
            "category": [
                "process"
            ],
            "type": [
                "start"
            ],
            "dataset": "endpoint.events.process",
            "outcome": "unknown"
        },
        "message": "Endpoint process event",
        "user": {
            "Ext": {
                "real": {
                    "name": "root",
                    "id": 0
                }
            },
            "name": "root",
            "id": 0
        },
        "group": {
            "Ext": {
                "real": {
                    "name": "root",
                    "id": 0
                }
            },
            "name": "root",
            "id": 0
        }
    }
};

export const GRANTED_RIGHTS_WINDOWS_SAMPLE_DOCUMENT = (timestamp: string) => {
    return {
        "agent": {
            "name": "instance-20250310-095950",
            "id": "11b2bb00-1c0a-4802-acad-d72adace8b07",
            "type": "filebeat",
            "ephemeral_id": "5ab9b933-ede3-4848-b1aa-898e21959180",
            "version": "8.18.0"
        },
        "winlog": {
            "computer_name": "instance-20250310-095950.priv.mon.com",
            "process": {
                "pid": 732,
                "thread": {
                    "id": 3668
                }
            },
            "keywords": [
                "Audit Success"
            ],
            "logon": {
                "id": "0x6e0cf"
            },
            "channel": "Security",
            "event_data": {
                "SubjectUserName": "stacy_armstrong",
                "MemberSid": "S-1-5-21-2195575277-1986032939-686191736-1327",
                "TargetSid": "S-1-5-21-2195575277-1986032939-686191736-512",
                "SubjectDomainName": "PRIV",
                "TargetUserName": "Domain Admins",
                "MemberName": "CN=ElasticTestUser1,CN=Users,DC=priv,DC=mon,DC=com",
                "SubjectLogonId": "0x6e0cf",
                "TargetDomainName": "PRIV",
                "SubjectUserSid": "S-1-5-21-2195575277-1986032939-686191736-1001"
            },
            "opcode": "Info",
            "record_id": "549591",
            "event_id": "4728",
            "task": "Special Logon",
            "provider_guid": "{54849625-5478-4994-a5ba-3e3b0328c30d}",
            "api": "wineventlog",
            "provider_name": "Microsoft-Windows-Security-Auditing"
        },
        "log": {
            "level": "information"
        },
        "elastic_agent": {
            "id": "11b2bb00-1c0a-4802-acad-d72adace8b07",
            "version": "8.18.0",
            "snapshot": false
        },
        "message": "A member was added to a security-enabled global group.\n\nSubject:\n\tSecurity ID:\t\tS-1-5-21-2195575277-1986032939-686191736-1001\n\tAccount Name:\t\tstacy_armstrong\n\tAccount Domain:\t\tPRIV\n\tLogon ID:\t\t0x6E0CF\n\nMember:\n\tSecurity ID:\t\tS-1-5-21-2195575277-1986032939-686191736-1327\n\tAccount Name:\t\tCN=ElasticTestUser1,CN=Users,DC=priv,DC=mon,DC=com\n\nGroup:\n\tSecurity ID:\t\tS-1-5-21-2195575277-1986032939-686191736-512\n\tGroup Name:\t\tDomain Admins\n\tGroup Domain:\t\tPRIV\n\nAdditional Information:\n\tPrivileges:\t\t-",
        "cloud": {
            "availability_zone": "us-east1-b",
            "instance": {
                "name": "instance-20250310-095950",
                "id": "1184115786468492807"
            },
            "provider": "gcp",
            "service": {
                "name": "GCE"
            },
            "machine": {
                "type": "e2-medium"
            },
            "project": {
                "id": "elastic-security-dev"
            },
            "region": "us-east1",
            "account": {
                "id": "elastic-security-dev"
            }
        },
        "input": {
            "type": "winlog"
        },
        "@timestamp": timestamp,
        "ecs": {
            "version": "8.11.0"
        },
        "related": {
            "user": [
                "ElasticTestUser1",
                "stacy_armstrong"
            ]
        },
        "data_stream": {
            "namespace": "default",
            "type": "logs",
            "dataset": "system.security"
        },
        "host": {
            "hostname": "instance-20250310-095950",
            "os": {
                "build": "26100.3194",
                "kernel": "10.0.26100.3194 (WinBuild.160101.0800)",
                "name": "Windows Server 2025 Datacenter",
                "family": "windows",
                "type": "windows",
                "version": "10.0",
                "platform": "windows"
            },
            "ip": [
                "fe80::6c57:9d38:f58:77a7",
                "10.142.0.87"
            ],
            "name": "instance-20250310-095950",
            "id": "a05156d5-172a-427b-befb-a0a4fae359a1",
            "mac": [
                "42-01-0A-8E-00-57"
            ],
            "architecture": "x86_64"
        },
        "event": {
            "agent_id_status": "verified",
            "ingested": timestamp,
            "code": "4728",
            "provider": "Microsoft-Windows-Security-Auditing",
            "kind": "event",
            "created": timestamp,
            "action": "added-member-to-group",
            "category": [
                "iam"
            ],
            "type": [
                "group",
                "change"
            ],
            "dataset": "system.security",
            "outcome": "success"
        },
        "user": {
            "domain": "PRIV",
            "name": "stacy_armstrong",
            "id": "S-1-5-21-2195575277-1986032939-686191736-1001",
            "target": {
                "domain": "mon",
                "name": "ElasticTestUser1",
                "group": {
                    "domain": "PRIV",
                    "name": "Domain Admins",
                    "id": "S-1-5-21-2195575277-1986032939-686191736-512"
                }
            }
        },
        "group": {
            "domain": "PRIV",
            "name": "Domain Admins",
            "id": "S-1-5-21-2195575277-1986032939-686191736-512"
        }
    }
};

export const GRANTED_RIGHTS_OKTA_SAMPLE_DOCUMENT = (timestamp: string) => {
    return {
        "agent": {
            "name": "test-ea-april-2025",
            "id": "3386a08e-7aa0-4c90-a5d5-a90f6fdb1396",
            "ephemeral_id": "663eafe2-58c3-4a7d-8ee7-06b8bc0b2064",
            "type": "filebeat",
            "version": "8.18.1"
        },
        "elastic_agent": {
            "id": "3386a08e-7aa0-4c90-a5d5-a90f6fdb1396",
            "version": "8.18.1",
            "snapshot": false
        },
        "source": {
            "user": {
                "full_name": "John Smith",
                "name": "john.smith",
                "id": "00unc8z0yifUyPmGp5d7"
            },
            "ip": "122.177.110.97"
        },
        "tags": [
            "preserve_original_event",
            "forwarded",
            "okta-system"
        ],
        "cloud": {
            "availability_zone": "us-east1-b",
            "instance": {
                "name": "test-ea-april-2025",
                "id": "2595859665373623247"
            },
            "provider": "gcp",
            "service": {
                "name": "GCE"
            },
            "machine": {
                "type": "e2-medium"
            },
            "project": {
                "id": "elastic-security-dev"
            },
            "region": "us-east1",
            "account": {
                "id": "elastic-security-dev"
            }
        },
        "input": {
            "type": "httpjson"
        },
        "@timestamp": timestamp,
        "ecs": {
            "version": "8.11.0"
        },
        "related": {
            "user": [
                "John Smith",
                "john personal",
                "john.smith"
            ]
        },
        "data_stream": {
            "namespace": "default",
            "type": "logs",
            "dataset": "okta.system"
        },
        "client": {
            "user": {
                "full_name": "John Smith",
                "name": "john.smith",
                "id": "00unc8z0yifUyPmGp5d7"
            }
        },
        "event": {
            "agent_id_status": "verified",
            "ingested": timestamp,
            "original": "{\"actor\":{\"alternateId\":\"john.smith@elastic.co\",\"detailEntry\":null,\"displayName\":\"John Smith\",\"id\":\"00unc8z0yifUyPmGp5d7\",\"type\":\"User\"},\"authenticationContext\":{\"authenticationProvider\":null,\"authenticationStep\":0,\"credentialProvider\":null,\"credentialType\":null,\"externalSessionId\":\"trsYKjppw2oRVK8eDb5WTERpA\",\"interface\":null,\"issuer\":null,\"rootSessionId\":\"102637TxYn7Q2CeuAZY5Uk0FA\"},\"client\":{\"device\":null,\"geographicalContext\":null,\"id\":null,\"ipAddress\":null,\"userAgent\":null,\"zone\":null},\"debugContext\":{\"debugData\":{\"privilegeGranted\":\"Organization administrator, Application administrator (all), User administrator (all), Help Desk administrator (all), API Access Management administrator, Report administrator\"}},\"device\":null,\"displayMessage\":\"Grant user privilege\",\"eventType\":\"user.account.privilege.grant\",\"legacyEventType\":\"core.user.admin_privilege.granted\",\"outcome\":{\"reason\":null,\"result\":\"SUCCESS\"},\"published\":\"2025-05-23T13:28:52.910Z\",\"request\":{\"ipChain\":[]},\"securityContext\":{\"asNumber\":null,\"asOrg\":null,\"domain\":null,\"ipDetails\":null,\"isProxy\":null,\"isp\":null,\"risk\":null,\"userBehaviors\":null},\"severity\":\"INFO\",\"target\":[{\"alternateId\":\"johnsmith@outlook.com\",\"detailEntry\":null,\"displayName\":\"john personal\",\"id\":\"00unfk8bsjqOb7wfs5d7\",\"type\":\"User\"},{\"alternateId\":\"unknown\",\"detailEntry\":null,\"displayName\":\"Role Assigned\",\"id\":\"ROLE_ASSIGNED\",\"type\":\"ROLE_ASSIGNED\"},{\"alternateId\":\"JBCUYUC7IRCVGS27IFCE2SKO\",\"detailEntry\":null,\"displayName\":\"Help Desk Administrator\",\"id\":\"HelpDeskAdmin\",\"type\":\"ROLE\"}],\"transaction\":{\"detail\":{},\"id\":\"unknown\",\"type\":null},\"uuid\":\"de83dce6-37d9-11f0-89f0-f3df565fd25f\",\"version\":\"0\"}",
            "created": timestamp,
            "kind": "event",
            "action": "user.account.privilege.grant",
            "id": "de83dce6-37d9-11f0-89f0-f3df565fd25f",
            "dataset": "okta.system",
            "outcome": "success"
        },
        "okta": {
            "actor": {
                "id": "00unc8z0yifUyPmGp5d7",
                "display_name": "John Smith",
                "type": "User",
                "alternate_id": "john.smith@elastic.co"
            },
            "debug_context": {
                "debug_data": {
                    "flattened": {
                        "privilegeGranted": "Organization administrator, Application administrator (all), User administrator (all), Help Desk administrator (all), API Access Management administrator, Report administrator"
                    }
                }
            },
            "event_type": "user.account.privilege.grant",
            "authentication_context": {
                "authentication_step": 0,
                "external_session_id": "trsYKjppw2oRVK8eDb5WTERpA"
            },
            "display_message": "Grant user privilege",
            "uuid": "de83dce6-37d9-11f0-89f0-f3df565fd25f",
            "outcome": {
                "result": "SUCCESS"
            },
            "transaction": {
                "id": "unknown"
            },
            "target": [
                {
                    "id": "00unfk8bsjqOb7wfs5d7",
                    "type": "User",
                    "display_name": "john personal",
                    "alternate_id": "johnsmith@outlook.com"
                },
                {
                    "id": "ROLE_ASSIGNED",
                    "type": "ROLE_ASSIGNED",
                    "display_name": "Role Assigned",
                    "alternate_id": "unknown"
                },
                {
                    "id": "HelpDeskAdmin",
                    "type": "ROLE",
                    "display_name": "Help Desk Administrator",
                    "alternate_id": "JBCUYUC7IRCVGS27IFCE2SKO"
                }
            ]
        },
        "user": {
            "full_name": "John Smith",
            "name": "john.smith",
            "target": {
                "full_name": "john personal",
                "id": "00unfk8bsjqOb7wfs5d7"
            }
        }
    }
}

export const ACCOUNT_SWITCH_LINUX_SAMPLE_DOCUMENT = (timestamp: string) => {
    return {
        "agent": {
            "id": "0e69acf6-97e6-418e-a4b7-281c59f10774",
            "type": "endpoint",
            "version": "8.17.2"
        },
        "process": {
            "Ext": {
                "ancestry": [
                    "6BgKzER6Fa4PxkA0byuTBg",
                    "zCpsYdUGbRD2y4swoZ8cdg",
                    "NC5QNVwVTgGbruNwQrKIYg",
                    "AE6dVyy4ybUY1WgeoZi5Yg",
                    "DRg/DWlKgFIrM/1qdefUeQ"
                ]
            },
            "parent": {
                "real_user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "interactive": true,
                "start": timestamp,
                "pid": 6643,
                "working_directory": "/home/john_smith/agent",
                "entity_id": "6BgKzER6Fa4PxkA0byuTBg",
                "executable": "/usr/bin/bash",
                "args": [
                    "-bash"
                ],
                "name": "bash",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "john_smith",
                    "id": 1029
                },
                "args_count": 1,
                "user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "command_line": "-bash",
                "group": {
                    "name": "john_smith",
                    "id": 1029
                }
            },
            "group_leader": {
                "real_user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "interactive": true,
                "start": timestamp,
                "pid": 7117,
                "working_directory": "/home/john_smith/agent",
                "entity_id": "YkoDtrkP142EdiIHapID2Q",
                "executable": "/usr/bin/sudo",
                "args": [
                    "sudo",
                    "su"
                ],
                "name": "sudo",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "john_smith",
                    "id": 1029
                },
                "args_count": 2,
                "same_as_process": true,
                "user": {
                    "name": "root",
                    "id": 0
                },
                "group": {
                    "name": "root",
                    "id": 0
                }
            },
            "previous": [
                {
                    "args": [
                        "-bash"
                    ],
                    "args_count": 1,
                    "executable": "/usr/bin/bash"
                }
            ],
            "real_user": {
                "name": "john_smith",
                "id": 1028
            },
            "interactive": true,
            "start": timestamp,
            "pid": 7117,
            "working_directory": "/home/john_smith/agent",
            "entity_id": "YkoDtrkP142EdiIHapID2Q",
            "executable": "/usr/bin/sudo",
            "args": [
                "sudo",
                "su"
            ],
            "session_leader": {
                "real_user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "interactive": true,
                "start": timestamp,
                "pid": 6643,
                "working_directory": "/home/john_smith/agent",
                "entity_id": "6BgKzER6Fa4PxkA0byuTBg",
                "executable": "/usr/bin/bash",
                "args": [
                    "-bash"
                ],
                "name": "bash",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "john_smith",
                    "id": 1029
                },
                "args_count": 1,
                "same_as_process": false,
                "user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "group": {
                    "name": "john_smith",
                    "id": 1029
                }
            },
            "entry_leader": {
                "parent": {
                    "start": timestamp,
                    "pid": 6642,
                    "entity_id": "zCpsYdUGbRD2y4swoZ8cdg"
                },
                "real_user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "interactive": true,
                "start": timestamp,
                "entry_meta": {
                    "source": {
                        "ip": "35.235.243.209"
                    },
                    "type": "sshd"
                },
                "pid": 6643,
                "working_directory": "/home/john_smith/agent",
                "entity_id": "6BgKzER6Fa4PxkA0byuTBg",
                "executable": "/usr/bin/bash",
                "args": [
                    "-bash"
                ],
                "name": "bash",
                "tty": {
                    "char_device": {
                        "major": 136,
                        "minor": 1
                    }
                },
                "real_group": {
                    "name": "john_smith",
                    "id": 1029
                },
                "args_count": 1,
                "same_as_process": false,
                "user": {
                    "name": "john_smith",
                    "id": 1028
                },
                "group": {
                    "name": "john_smith",
                    "id": 1029
                }
            },
            "name": "sudo",
            "tty": {
                "char_device": {
                    "major": 136,
                    "minor": 1
                }
            },
            "real_group": {
                "name": "john_smith",
                "id": 1029
            },
            "args_count": 2,
            "user": {
                "name": "root",
                "id": 0
            },
            "command_line": "sudo su",
            "hash": {
                "sha1": "37b9a71fd9f9aa798b78277e76c70da0268f9139",
                "sha256": "cafbdbfd938d25c09da67bcde78e4c4f25817e3018863f9f5ee4b3807f1bbffa",
                "md5": "f25b6903acaf33aac0bb19a71628e0e0"
            },
            "group": {
                "name": "root",
                "id": 0
            }
        },
        "@timestamp": timestamp,
        "ecs": {
            "version": "8.10.0"
        },
        "data_stream": {
            "namespace": "default",
            "type": "logs",
            "dataset": "endpoint.events.process"
        },
        "elastic": {
            "agent": {
                "id": "0e69acf6-97e6-418e-a4b7-281c59f10774"
            }
        },
        "host": {
            "hostname": "sec-ea-test-agent",
            "os": {
                "Ext": {
                    "variant": "Debian"
                },
                "kernel": "6.1.0-31-cloud-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.128-1 (2025-02-07)",
                "name": "Linux",
                "family": "debian",
                "type": "linux",
                "version": "12.9",
                "platform": "debian",
                "full": "Debian 12.9"
            },
            "ip": [
                "127.0.0.1",
                "::1",
                "10.142.0.62",
                "fe80::4001:aff:fe8e:3e"
            ],
            "name": "sec-ea-test-agent",
            "id": "7029f5b274ff4b9c93ad6fcca5daebce",
            "mac": [
                "42-01-0a-8e-00-3e"
            ],
            "architecture": "x86_64"
        },
        "event": {
            "agent_id_status": "verified",
            "sequence": 400,
            "ingested": timestamp,
            "created": timestamp,
            "kind": "event",
            "module": "endpoint",
            "action": [
                "gid_change"
            ],
            "id": "NvKkgQydS/iEAhHY++++++7w",
            "category": [
                "process"
            ],
            "type": [
                "change"
            ],
            "dataset": "endpoint.events.process",
            "outcome": "unknown"
        },
        "message": "Endpoint process event",
        "user": {
            "Ext": {
                "real": {
                    "name": "john_smith",
                    "id": 1028
                }
            },
            "name": "root",
            "id": 0
        },
        "group": {
            "Ext": {
                "real": {
                    "name": "john_smith",
                    "id": 1029
                }
            },
            "name": "root",
            "id": 0
        }
    }
};

export const OKTA_AUTHENTICATION = (timestamp: string) => {
    return {
        "agent": {
            "name": "ec5a443c8881",
            "id": "dfe3d476-049a-461c-a106-04bec11ab3f9",
            "ephemeral_id": "0140a135-c90d-4d52-9e1c-5b24a1a7b277",
            "type": "filebeat",
            "version": "8.17.0"
        },
        "elastic_agent": {
            "id": "dfe3d476-049a-461c-a106-04bec11ab3f9",
            "version": "8.17.0",
            "snapshot": false
        },
        "source": {
            "geo": {
                "region_iso_code": "US-FL",
                "continent_name": "North America",
                "city_name": "Miami",
                "country_iso_code": "US",
                "country_name": "United States",
                "location": {
                    "lon": -80.2927,
                    "lat": 25.7034
                },
                "region_name": "Florida"
            },
            "as": {
                "number": 7018,
                "organization": {
                    "name": "ATT-INTERNET4"
                }
            },
            "ip": "162.200.141.72",
            "domain": "sbcglobal.net",
            "user": {
                "full_name": "Randy Carlisle",
                "name": "randy.carlisle",
                "id": "00uk3xaeudYtHS5l65d7"
            }
        },
        "tags": [
            "preserve_original_event",
            "forwarded",
            "okta-system"
        ],
        "input": {
            "type": "httpjson"
        },
        "@timestamp": timestamp,
        "ecs": {
            "version": "8.11.0"
        },
        "related": {
            "ip": [
                "162.200.141.72"
            ],
            "user": [
                "Randy Carlisle",
                "randy.carlisle"
            ]
        },
        "data_stream": {
            "namespace": "default",
            "type": "logs",
            "dataset": "okta.system"
        },
        "client": {
            "geo": {
                "city_name": "Miami",
                "country_name": "United States",
                "location": {
                    "lon": -80.2927,
                    "lat": 25.7034
                },
                "region_name": "Florida"
            },
            "as": {
                "organization": {
                    "name": "at&t enterprises  llc"
                }
            },
            "ip": "162.200.141.72",
            "domain": "sbcglobal.net",
            "user": {
                "full_name": "Randy Carlisle",
                "name": "randy.carlisle",
                "id": "00uk3xaeudYtHS5l65d7"
            }
        },
        "event": {
            "agent_id_status": "verified",
            "ingested": timestamp,
            "original": "{\"actor\":{\"alternateId\":\"randy.carlisle@elastic.co\",\"detailEntry\":null,\"displayName\":\"Randy Carlisle\",\"id\":\"00uk3xaeudYtHS5l65d7\",\"type\":\"User\"},\"authenticationContext\":{\"authenticationProvider\":null,\"authenticationStep\":0,\"credentialProvider\":null,\"credentialType\":null,\"externalSessionId\":\"102yKnyfms6S1iImIJf9HuZKg\",\"interface\":null,\"issuer\":null,\"rootSessionId\":\"102yKnyfms6S1iImIJf9HuZKg\"},\"client\":{\"device\":\"Computer\",\"geographicalContext\":{\"city\":\"Miami\",\"country\":\"United States\",\"geolocation\":{\"lat\":25.7034,\"lon\":-80.2927},\"postalCode\":\"33143\",\"state\":\"Florida\"},\"id\":null,\"ipAddress\":\"162.200.141.72\",\"userAgent\":{\"browser\":\"CHROME\",\"os\":\"Mac OS X\",\"rawUserAgent\":\"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\"},\"zone\":\"null\"},\"debugContext\":{\"debugData\":{\"audience\":\"https://us-east-1.signin.aws.amazon.com/platform/saml/d-9067c18e9e\",\"authTime\":\"2024-12-31T22:08:59.012Z\",\"authenticationClassRef\":\"urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport\",\"authnRequestId\":\"3a665ed443c298a09e47991501e38a0f\",\"dtHash\":\"132be512dfc4bed0edbf23d7ae3c9d00093d838f6d30f629305427ac4267a672\",\"expiryTime\":\"2024-12-31T22:13:59.012Z\",\"initiationType\":\"IDP_INITIATED\",\"issuedAt\":\"2024-12-31T22:08:59.012Z\",\"issuer\":\"http://www.okta.com/exkm44qweyWDF18z55d7\",\"jti\":\"id1551895843302991298693170\",\"requestId\":\"83a814cc78c39545daa0fb455d6a5dad\",\"requestUri\":\"/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml\",\"signOnMode\":\"SAML 2.0\",\"subject\":\"randy.carlisle@elastic.co\",\"traceId\":\"5e6efaa3-3c0c-4d7f-89c2-7434ad97e494\",\"url\":\"/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml?\"}},\"device\":null,\"displayMessage\":\"User single sign on to app\",\"eventType\":\"user.authentication.sso\",\"legacyEventType\":\"app.auth.sso\",\"outcome\":{\"reason\":null,\"result\":\"SUCCESS\"},\"published\":\"2024-12-31T22:08:59.019Z\",\"request\":{\"ipChain\":[{\"geographicalContext\":{\"city\":\"Miami\",\"country\":\"United States\",\"geolocation\":{\"lat\":25.7034,\"lon\":-80.2927},\"postalCode\":\"33143\",\"state\":\"Florida\"},\"ip\":\"162.200.141.72\",\"source\":null,\"version\":\"V4\"}]},\"securityContext\":{\"asNumber\":7018,\"asOrg\":\"at\\u0026t enterprises  llc\",\"domain\":\"sbcglobal.net\",\"isProxy\":false,\"isp\":\"att corp\"},\"severity\":\"INFO\",\"target\":[{\"alternateId\":\"AWS Dev Account\",\"detailEntry\":{\"signOnModeType\":\"SAML_2_0\"},\"displayName\":\"AWS Dev Account\",\"id\":\"0oam44qwezA075Gms5d7\",\"type\":\"AppInstance\"},{\"alternateId\":\"randy.carlisle@elastic.co\",\"detailEntry\":null,\"displayName\":\"Randy Carlisle\",\"id\":\"0uam44pvujFmdOjLu5d7\",\"type\":\"AppUser\"}],\"transaction\":{\"detail\":{},\"id\":\"83a814cc78c39545daa0fb455d6a5dad\",\"type\":\"WEB\"},\"uuid\":\"d5bbf620-c7c3-11ef-8b08-adee8697db96\",\"version\":\"0\"}",
            "created": timestamp,
            "kind": "event",
            "module": "endpoint",
            "action": "user.authentication.sso",
            "id": "d5bbf620-c7c3-11ef-8b08-adee8697db96",
            "category": [
                "authentication"
            ],
            "type": [
                "info"
            ],
            "dataset": "okta.system",
            "outcome": "success"
        },
        "okta": {
            "actor": {
                "id": "00uk3xaeudYtHS5l65d7",
                "display_name": "Randy Carlisle",
                "type": "User",
                "alternate_id": "randy.carlisle@elastic.co"
            },
            "request": {
                "ip_chain": [
                    {
                        "geographical_context": {
                            "country": "United States",
                            "city": "Miami",
                            "state": "Florida",
                            "postal_code": "33143",
                            "geolocation": {
                                "lon": -80.2927,
                                "lat": 25.7034
                            }
                        },
                        "ip": "162.200.141.72",
                        "version": "V4"
                    }
                ]
            },
            "debug_context": {
                "debug_data": {
                    "flattened": {
                        "traceId": "5e6efaa3-3c0c-4d7f-89c2-7434ad97e494",
                        "audience": "https://us-east-1.signin.aws.amazon.com/platform/saml/d-9067c18e9e",
                        "subject": "randy.carlisle@elastic.co",
                        "signOnMode": "SAML 2.0",
                        "authenticationClassRef": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
                        "authTime": timestamp,
                        "requestUri": "/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml",
                        "issuer": "http://www.okta.com/exkm44qweyWDF18z55d7",
                        "url": "/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml?",
                        "initiationType": "IDP_INITIATED",
                        "authnRequestId": "3a665ed443c298a09e47991501e38a0f",
                        "requestId": "83a814cc78c39545daa0fb455d6a5dad",
                        "dtHash": "132be512dfc4bed0edbf23d7ae3c9d00093d838f6d30f629305427ac4267a672",
                        "expiryTime": timestamp,
                        "issuedAt": timestamp,
                        "jti": "id1551895843302991298693170"
                    },
                    "dt_hash": "132be512dfc4bed0edbf23d7ae3c9d00093d838f6d30f629305427ac4267a672",
                    "request_id": "83a814cc78c39545daa0fb455d6a5dad",
                    "request_uri": "/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml",
                    "url": "/app/dev-36006609_awstest_1/exkm44qweyWDF18z55d7/sso/saml?"
                }
            },
            "event_type": "user.authentication.sso",
            "authentication_context": {
                "authentication_step": 0,
                "external_session_id": "102yKnyfms6S1iImIJf9HuZKg"
            },
            "display_message": "User single sign on to app",
            "client": {
                "zone": "null",
                "ip": "162.200.141.72",
                "device": "Computer",
                "user_agent": {
                    "raw_user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    "os": "Mac OS X",
                    "browser": "CHROME"
                }
            },
            "uuid": "d5bbf620-c7c3-11ef-8b08-adee8697db96",
            "outcome": {
                "result": "SUCCESS"
            },
            "transaction": {
                "id": "83a814cc78c39545daa0fb455d6a5dad",
                "type": "WEB"
            },
            "security_context": {
                "as": {
                    "number": 7018,
                    "organization": {
                        "name": "at&t enterprises  llc"
                    }
                },
                "domain": "sbcglobal.net",
                "isp": "att corp",
                "is_proxy": false
            },
            "target": [
                {
                    "id": "0oam44qwezA075Gms5d7",
                    "type": "AppInstance",
                    "display_name": "AWS Dev Account",
                    "alternate_id": "AWS Dev Account"
                },
                {
                    "id": "0uam44pvujFmdOjLu5d7",
                    "type": "AppUser",
                    "display_name": "Randy Carlisle",
                    "alternate_id": "randy.carlisle@elastic.co"
                }
            ]
        },
        "user": {
            "full_name": "Randy Carlisle",
            "name": "randy.carlisle"
        },
        "user_agent": {
            "original": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "os": {
                "name": "Mac OS X",
                "version": "10.15.7",
                "full": "Mac OS X 10.15.7"
            },
            "name": "Chrome",
            "device": {
                "name": "Mac"
            },
            "version": "131.0.0.0"
        }
    }
};