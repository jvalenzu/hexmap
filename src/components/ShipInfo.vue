<script setup>
defineProps({
  msg: {
    type: String,
    required: true
  }
})
</script>

<template>
<div id="ship-info-container" style="background-color: white" width="100%">
    {{msg}}
      <embed src="assets/ships/FederationHeavyCruiser.svg" height="100%"/>
  </div>
</template>
