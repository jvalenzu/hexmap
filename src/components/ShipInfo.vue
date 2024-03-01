<script setup>
defineProps({
  msg: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  }
})
</script>

<template>
<div id="ship-info-container" style="background-color: white">
    <div style="box-sizing: border-box; height: 50px;"><h1>{{msg}}</h1></div>
    <embed id="ship-card-0" src="assets/ships/FederationHeavyCruiser.svg" type="image/svg+xml">
</div>
</template>
