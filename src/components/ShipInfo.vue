<script setup>
defineProps({
  msg: {
    type: String,
    required: true
  }
})
</script>

<template>
<div id="ship-info-container" style="background-color: white">
    <div style="box-sizing: border-box; height: 50px;"><h1>{{msg}}</h1></div>
    <embed src="assets/ships/FederationHeavyCruiser.svg" type="image/svg+xml" height="100%"/>
  </div>
</template>
