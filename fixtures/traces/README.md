# Synthetic fixtures

All sessions are deterministic synthetic SDK metadata, not account measurements. Default workload is one user, one session; minimum query and fresh-execution assumptions apply.

| Trace        | Modeled baseline | Expected findings                                    |
| ------------ | ---------------: | ---------------------------------------------------- |
| efficient    |               27 | coverage; one unresolved removal                     |
| churn        |              162 | churn, active-at-exit investigation, coverage        |
| large-query  |              303 | large snapshot, coverage                             |
| high-updates |              104 | high update, coverage                                |
| cache-heavy  |                0 | coverage; cache does not prove reads                 |
| reconnect    |               27 | reconnect uncertainty, coverage; no automatic replay |
| incomplete   |               27 | coverage with 2 declared missing events              |

With DAU=500 and sessions/user=2, churn projects 162,000 reads/day and fails a 50,000 modeled budget. Declared replay scenario examples are in ../scenarios/reconnect.json. Expectations validate our model, not production billing.
