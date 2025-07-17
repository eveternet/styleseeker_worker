import { App } from "./plugin_class";
import { ShopcadaPluginInfo } from "./shopcada";

App.register("shopcada", ShopcadaPluginInfo);

const createApp = (plugin_name: string, app_id: string) => {
  const AppClass = App.registry[plugin_name];
  if (!AppClass) {
    throw new Error(`Plugin ${plugin_name} not found`);
  }
  return new AppClass(app_id);
};

export default createApp;
