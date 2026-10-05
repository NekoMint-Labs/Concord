# IFC Viewer Online SDK

Upstream: j03rul4nd/ifc-viewer-online at 5073adf1f5fadef76129460555482b6507c2be74.
License: MIT; original LICENSE is retained here.

ifc-viewer-sdk.ts is attributed upstream source, including its original custom
web component. Its size is inherited from upstream. Concord's bespoke surface
and adapter are separate small modules under frontend/src/viewers/ifc.

Narrow adaptations add same-origin message checks, native GlobalId and cache
qualification queries, standard BCF byte capture/reopening queries, safe ArrayBuffer copying for TypeScript 5.9, and the
existing donor URL overrides for host-owned toolbar/properties behavior and native ModelTree visibility.
Reproducible source patches and the standalone build entry point are under
frontend/viewer-integrations/ifc. This SDK is imported only after the IFC surface
opens and a local capability marker is verified.
