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
      <embed src="src/assets/FederationHeavyCruiser.svg" height="100%"/>
  </div>
</template>
