<script setup>
import StatusLine from './components/StatusLine.vue';
import ShipInfo from './components/ShipInfo.vue';
import Map from './components/Map.vue';
</script>

<template>
    <div>
<StatusLine/>
<div id="main-container">
    <ShipInfo msg="You did it!" />
    <Map />
</div>
</div>
</template>
