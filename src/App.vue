<script setup>
import StatusLine from './components/StatusLine.vue';
import ShipInfo from './components/ShipInfo.vue';
import Map from './components/Map.vue';

import SimGlobals from './sim.js';

</script>

<template>
    <div>
        <StatusLine :turn_status="SimGlobals.g_TurnStatus"
                    :context_message="SimGlobals.g_ContextMessage"
                    :debug_options="SimGlobals.g_DebugOptions"
                    :change_debug_options="SimGlobals.changeDebugOptions"
                    :action_buttons="SimGlobals.g_ActionButtons"/>
        <div id="main-container" width="100%">
            <ShipInfo msg="Federation Heavy Cruiser"/>
            <Map />
        </div>
    </div>
</template>
