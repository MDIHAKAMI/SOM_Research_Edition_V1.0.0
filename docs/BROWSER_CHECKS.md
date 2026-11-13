# Browser checks for release 1.0.0



- Created a research case with a user-entered study ID, recorder code and participant code.
- Saved a propofol administration with its amount, unit and occurrence time.
- Saved a clinical-event label with neuromuscular and ventilation context.
- Confirmed concentration and H/N displays updated and a dose/event timeline was retained.
- Ended the case through the interface and received its Excel download.
- Reopened the downloaded workbook independently: all 20 worksheets parsed, Study ID and participant code matched, synthetic-data status was retained, and dose/event/model information was present.
- Reloaded the completed case: it remained completed and its three entries were retained; entry controls stayed disabled and Excel re-export remained available.
- Imported the supplied synthetic research backup; the application reported one imported case and added its study to the saved-case list. Opened its completed record and confirmed 15 retained entries, including the voided 100 mg dose and corrected 120 mg dose.
- Opened the original event snapshot after import: saved propofol Cp/Ce remained 9.07/5.33 and H remained 4.92 despite the later correction.
- Started a separate preview from only the built dist files and the supplied Node static-file launcher, without node_modules. The stored case reopened, its graphs calculated, and the hypothetical 20 mg propofol preview returned the four expected forecast rows without adding an entry.

A false cross-tab lock on effect replay and a stale recovery-status message were found and fixed. Three regression tests cover the lock lifecycle, including preservation of actual separate-tab protection. The complete automated application suite passes 154 tests.

These checks support the listed browser workflows. 